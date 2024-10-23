import { Inject, Injectable, Logger } from '@nestjs/common';
import { ethers, toBeArray, Wallet } from 'ethers';
import { OracleXAbi } from './lib/abi.utils';
import {
  AuthMode,
  dataCommitBySigType2,
  DataCommitment2,
  EventLogEntity,
} from './lib/oracle-x.interface';

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
    '0x67F59911469cefE3BFe43ffbcF0E63C6Dc0F0616';

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

  constructor() {
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

  public async scanDataCommitmentsTask(eventLogEntity: EventLogEntity) {
    if (eventLogEntity.eventData.length == 0) {
      return;
    }
    const authMode = eventLogEntity.eventData.authMode;

    // this.logger.log(
    //   `subscriptionId: ${eventLogEntity.eventData.subsciptionId}`,
    // );
    switch (authMode) {
      case AuthMode.SIGNATURE:
        await this.buildDataCommitment(eventLogEntity);
        break;
      case AuthMode.MULTISIG:
        // await this.buildDataCommitment();
        break;
      case AuthMode.PROOF:
        // await this.buildDataCommitment();
        break;
      default:
        break;
    }
  }

  private async buildDataCommitment(eventLogEntity: EventLogEntity) {
    const chainId = 31337;
    const AbiCoder = ethers.AbiCoder.defaultAbiCoder();

    // this.logger.log(`oracleX: ${await this.oracleX.getAddress()}`);

    const dataCommitment: DataCommitment2 = {
      oracleXAddr: await this.oracleX.getAddress(),
      currChainId: chainId,
      subscriptionId: eventLogEntity.eventData.subsciptionId,
      data: AbiCoder.encode(['uint256'], [2]),
    };

    const tx = await this.dataCommitmentBySignatureActiveMode(dataCommitment);
    await tx.wait();
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
}
