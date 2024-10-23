// src/oracle-x.schedule.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  Cron,
  CronExpression,
  Interval,
  SchedulerRegistry,
} from '@nestjs/schedule';
import { ethers } from 'ethers';
import { OracleXAbi } from './lib/abi.utils';
import {
  AuthMode,
  EventLogEntity,
  MessageMatchedFlag,
} from './lib/oracle-x.interface';
import { OraclexDataCommitService } from './oracle-x-data-commit.service';

@Injectable()
export class OracleXSchedule {
  private readonly logger = new Logger(OracleXSchedule.name);

  // Ethereum RPC provider (could use Infura, Alchemy, or a local node)
  private provider: ethers.Provider;

  // ERC20 contract address to listen to
  private contractAddress: string =
    process.env.ORACLE_X_CONTRACT_ADDRESS ||
    '0x67F59911469cefE3BFe43ffbcF0E63C6Dc0F0616';

  private url: string = process.env.RPC_NODE || 'http://127.0.0.1:8545/';

  private iface = new ethers.Interface(OracleXAbi);

  private lastScannedBlock = 0;

  private coldStart = true;

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private dataCommitservice: OraclexDataCommitService,
  ) {}

  private async initProvider(): Promise<void> {
    this.provider = new ethers.JsonRpcProvider(this.url);
  }

  private async getLatestBlock(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  private async shouldScan(): Promise<boolean> {
    const latestBlock = await this.getLatestBlock();
    this.logger.log(`latestBlock:${latestBlock}`);
    return latestBlock > this.lastScannedBlock;
  }

  @Interval(3000)
  async startScanning(): Promise<void> {
    await this.initProvider();
    const version = await this.dataCommitservice.getVersion();
    this.logger.log(`OracleX dataCommitService version: ${version}`);
    if (await this.shouldScan()) {
      this.logger.log(
        `coldStart: ${this.coldStart}, lastScannedBlock: ${this.lastScannedBlock}`,
      );
      const startBlock = this.coldStart ? 0 : this.lastScannedBlock;
      this.coldStart = false;
      await this.scanBlocks(startBlock);
    }
  }

  private async scanBlocks(
    startBlock: number,
    step: number = 4,
  ): Promise<void> {
    try {
      const logs = await this.provider.getLogs({
        fromBlock: startBlock,
        toBlock: startBlock + step - 1,
        address: this.contractAddress,
      });
      this.logger.log(`Scanned block ${startBlock} - ${startBlock + step - 1}`);
      this.lastScannedBlock = startBlock + step;
      await this.processTransactionLogs(logs);
    } catch (error) {
      this.logger.error(`Error scanning block ${startBlock}: ${error.message}`);
    }
  }

  private async processTransactionLogs(logs: ethers.Log[]): Promise<void> {
    for (const log of logs) {
      const address = log.address.toLowerCase();
      if (address === this.contractAddress.toLowerCase()) {
        try {
          const parsedLog = this.iface.parseLog(log);
          if (!parsedLog || !parsedLog.name) {
            continue;
          }
          const eventData = this.convertOracleXEventData(
            parsedLog.name,
            parsedLog.args,
          );
          if (!eventData) {
            continue;
          }
          const eventLogEntity: EventLogEntity = {
            eventData: eventData,
          };
          this.logger.log(eventLogEntity);
          await this.dataCommitservice.scanDataCommitmentsTask(eventLogEntity);
        } catch (error) {
          this.logger.error(`Error parsing log: ${error.message}`);
        }
      }
    }
  }

  private convertAuhMode(authMode: string): string {
    switch (authMode) {
      case '0x00':
        return AuthMode.SIGNATURE;
      case '0x01':
        return AuthMode.MULTISIG;
      case '0x02':
        return AuthMode.PROOF;
      default:
        return 'UNKNOWN';
    }
  }

  private convertOracleXEventData(name: string, args: any): any {
    if (!name || !args) {
      return null;
    }
    if (name === 'QueryActiveModeSubmitted') {
      return {
        flag: MessageMatchedFlag.ACTIVE_MODE_QUERY,
        subsciptionId: args[0].toString(),
        authMode: this.convertAuhMode(args[1][1].toString()),
        managerAddress: args[1][2].toString().toLocaleLowerCase(),
        extraParams: args[1][3].toString(),
      };
    } else if (name === 'QueryPassiveModeSubmitted') {
      return {
        flag: MessageMatchedFlag.PASSIVE_MODE_QUERY,
        subsciptionId: args[2][0].toString(),
        authMode: this.convertAuhMode(args[2][1].toString()),
        managerAddress: args[2][3].toString().toLocaleLowerCase(),
        extraParams: args[2][5].toString(),
        requestId: args[0].toString(),
        nonce: args[1].toString(),
        callbackAddress: args[2][2].toString().toLocaleLowerCase(),
        callbackGasLimit: args[2][4].toString(),
      };
    } else if (name === 'DataCommitmentExecutedPassive') {
      return {
        flag: MessageMatchedFlag.PASSIVE_MODE_COMMITMENT,
        requestId: args[0].toString(),
        taskId: args[1].toString(),
        callbackAddress: args[2].toString().toLocaleLowerCase(),
        authMode: this.convertAuhMode(args[3].toString()),
      };
    } else if (name === 'DataCommitmentExecutedActive') {
      return {
        flag: MessageMatchedFlag.ACTIVE_MODE_COMMITMENT,
        subId: args[0].toString(),
        authMode: this.convertAuhMode(args[1].toString()),
      };
    }
    return null;
  }
}
