import { Inject, Injectable, Logger } from '@nestjs/common';
import { ethers, toBeArray, Wallet } from 'ethers';
import { OracleXAbi } from './lib/abi.utils';
import {
  AuthMode,
  dataCommitBySigType2,
  DataCommitment1,
  DataCommitment2,
  EventLogEntity,
  ProofPublicInput,
} from './lib/oracle-x.interface';
import { Interval, SchedulerRegistry } from '@nestjs/schedule';
import { OracleXSchedule } from './oracle-x.schedule';

@Injectable()
export class OracleX {
  private oracleXContract: ethers.Contract;

  constructor(
    private readonly logger: Logger,
    @Inject('ORACLE_X_CONTRACT_ADDRESS')
    private readonly contractAddress: string,
    @Inject('ORACLE_X_ABI') private readonly abi: any,
    @Inject('ORACLE_X_PRIVATE_KEY') private readonly privateKey: string,
  ) {
    this.logger.debug(`OracleX contract address: ${this.contractAddress}`);
    this.logger.debug(`OracleX abi: ${this.abi}`);
    this.logger.debug(`OracleX private key: ${this.privateKey}`);

    this.oracleXContract = new ethers.Contract(
      this.contractAddress,
      this.abi,
      new ethers.Wallet(this.privateKey),
    );
  }

  async connect(provider: ethers.Provider): Promise<ethers.Contract> {
    return this.oracleXContract.connect(provider) as ethers.Contract;
  }
}

@Injectable()
export class OraclexDataCommitService {
  private readonly logger = new Logger(OraclexDataCommitService.name);

  private oracleXSigner: ethers.Signer;

  private contractAddress: string =
    process.env.ORACLE_X_CONTRACT_ADDRESS ||
    '0xb71D7A9381b85D67CBc9E3302492656057964bc0';

  private url: string = process.env.RPC_NODE || 'http://127.0.0.1:8545/';

  private oracleX: ethers.Contract;

  private initSigner() {
    const mnemonic = process.env.ORACLE_X_SIGNER_MNEMONIC;
    if (!mnemonic) {
      throw new Error('ORACLE_X_MNEMONIC is required');
    }

    this.oracleXSigner = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/0",
    ).connect(new ethers.JsonRpcProvider(this.url));

    return this.oracleXSigner;
  }

  private iface = new ethers.Interface(OracleXAbi);

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private oracleXScanner: OracleXSchedule,
  ) {
    this.oracleX = new ethers.Contract(
      this.contractAddress,
      OracleXAbi,
      this.initSigner(),
    );
  }

  public async getVersion(): Promise<string> {
    const version = await this.oracleX.version();
    return version;
  }

  public async getOracleXSigner(): Promise<ethers.Signer> {
    return this.oracleXSigner;
  }

  @Interval(5000)
  async scanDataCommitmentsTask(): Promise<void> {
    const eventLogEntities = this.oracleXScanner.fetchSubscriptions();

    for (const eventLogEntity of eventLogEntities) {
      const authMode = eventLogEntity.eventData.authMode;

      switch (authMode) {
        case AuthMode.SIGNATURE:
          await this.buildDataCommitmentSingleSignature(eventLogEntity);
          break;
        case AuthMode.MULTISIG:
          break;
        default:
          break;
      }
    }
  }

  private async buildDataCommitmentSingleSignature(
    eventLogEntity: EventLogEntity,
  ) {
    const chainId = 31337;
    const AbiCoder = ethers.AbiCoder.defaultAbiCoder();

    const dataCommitment: DataCommitment2 = {
      oracleXAddr: await this.oracleX.getAddress(),
      currChainId: chainId,
      subscriptionId: eventLogEntity.eventData.subsciptionId,
      data: AbiCoder.encode(['uint256'], [2]),
    };

    const tx = await this.dataCommitmentBySignatureActiveMode(dataCommitment);
    await tx.wait();
    this.logger.log(`======Data commitment by signature created: ${tx.hash}`);
  }

  private async dataCommitmentBySignatureActiveMode(
    dataCommitment: DataCommitment2,
  ) {
    const signature = await this.activeModeDataSig(
      this.oracleXSigner,
      dataCommitment,
    );
    return await this.oracleX.dataCommitmentBySignatureA(
      dataCommitment.subscriptionId,
      dataCommitment.data,
      [signature],
    );
  }

  private async activeModeDataSig(
    signer: ethers.Signer,
    dataCommitment: DataCommitment2,
  ) {
    const AbiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodeMessageHash = ethers.keccak256(
      AbiCoder.encode(dataCommitBySigType2, [
        dataCommitment.oracleXAddr,
        dataCommitment.currChainId,
        dataCommitment.subscriptionId,
        dataCommitment.data,
      ]),
    );
    return await signer.signMessage(toBeArray(encodeMessageHash));
  }

  private async dataCommitmentByProofPassiveMode(
    dataCommitment: DataCommitment1,
  ) {
    const publicInput: ProofPublicInput = {
      taskId: 0,
      callbackSelector: dataCommitment.callbackSelector,
      queryMode: '0x00',
      requestId: dataCommitment.requestId,
      subId: dataCommitment.requestId,
      callbackAddress: dataCommitment.callbackAddress,
      callbackGasLimit: dataCommitment.callbackGasLimit,
      data: dataCommitment.data,
    };
    const proof = this.publicInputEncode(publicInput);
    const tx = await this.oracleX.dataCommitmentByProof(proof);
    await tx.wait();
    this.logger.log(`Data commitment by proof created: ${tx.hash}`);
  }

  private publicInputEncode(proofPublicInput: ProofPublicInput) {
    const padTaskId = ethers.zeroPadValue(
      toBeArray(proofPublicInput.taskId.toString()),
      8,
    );
    const padCallbackSelector = ethers.zeroPadValue(
      toBeArray(proofPublicInput.callbackSelector),
      4,
    );
    const padQueryMode = ethers.zeroPadValue(
      toBeArray(proofPublicInput.queryMode),
      1,
    );
    const padRequestId = ethers.zeroPadValue(
      toBeArray(ethers.hexlify(proofPublicInput.requestId)),
      32,
    );
    const padSubId = ethers.zeroPadValue(
      toBeArray(ethers.hexlify(proofPublicInput.subId)),
      32,
    );
    const padCallbackAddress = ethers.zeroPadValue(
      toBeArray(ethers.hexlify(proofPublicInput.callbackAddress.toString())),
      20,
    );
    const padCallbackGasLimit = ethers.zeroPadValue(
      toBeArray(proofPublicInput.callbackGasLimit.toString()),
      8,
    );
    const padData = ethers.zeroPadValue(
      toBeArray(ethers.hexlify(proofPublicInput.data)),
      32,
    );
    const publicInputData =
      '0x' +
      padTaskId.replace('0x', '') +
      padCallbackSelector.replace('0x', '') +
      padQueryMode.replace('0x', '') +
      padRequestId.replace('0x', '') +
      padSubId.replace('0x', '') +
      padCallbackAddress.replace('0x', '') +
      padCallbackGasLimit.replace('0x', '') +
      padData.replace('0x', '');

    const encodedata = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes'],
      [publicInputData],
    );

    return '0x8e760afe' + encodedata.replace('0x', '');
  }
}
