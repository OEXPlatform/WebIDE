import React, { Component } from 'react';
import { Feedback, Card, Select, Checkbox } from '@icedesign/base';
import Container from '@icedesign/container';
import { Input, Button, Tab, Grid, Tree, Dialog, Collapse, Message, Icon, Balloon, Shell } from '@alifd/next';
import * as oexchain from 'oex-web3';
import * as ethers from 'ethers';
import * as ethUtil from 'ethereumjs-util';
import * as abiUtil from 'ethereumjs-abi';
import cookie from 'react-cookies';
import BigNumber from 'bignumber.js';
import { encode } from 'rlp';
import ReactJson from 'react-json-view';
import copy from 'copy-to-clipboard';
import IceEllipsis from '@icedesign/ellipsis';

import * as utils from '../../utils/utils';
import * as keystore from '../../utils/keystore';
import * as txParser from '../../utils/transactionParser';
import * as sha256 from '../../utils/sha256';
import * as Notification from '../../utils/notification';
import { T } from '../../utils/lang';
import TxSend from "../TxSend";
import * as Constant from '../../utils/constant';
import ContractEditor from './components/Editor';
import './ContractDev.scss';
import * as CompilerSrv from './CompilerSrv';

const { Row, Col } = Grid;
const TreeNode = Tree.Node;
const Panel = Collapse.Panel;

const Transfer = ({self, contractName, funcName}) => {
  return <div>
    <Checkbox key='transferCheck'
      onChange={checked => {
        let transferTogether = utils.deepClone(self.state.transferTogether);
        transferTogether[contractName + funcName] = checked;
        let visibilityValue = utils.deepClone(self.state.visibilityValue);
        visibilityValue[contractName + funcName] = checked ? 'block' : 'none';
        // self.state.visibilityValue[funcName] = checked ? 'block' : 'none';
        self.setState({ transferTogether, visibilityValue, txSendVisible: false });
        // var obj = document.getElementById(contractName + funcName + 'Container');
        // obj.style.display= visibilityValue[contractName + funcName];
      }}>{T('附带转账')}
    </Checkbox>
    <br />
    <br />
    <Container key='transferContainer' id={contractName + funcName + 'Container'} style={{display: self.state.visibilityValue[contractName + funcName], height:'50'}}>
      <Input hasClear
        onChange={self.handleParaValueChange.bind(self, contractName, funcName, 'transferAssetId')}
        style={{ ...styles.inputBoder, width: 600 }}
        innerBefore={T('转账资产ID')}
        size="medium"
        placeholder="多笔资产请用英文逗号分隔，跟资产金额需一一对应，如：0,1,10"
      />
      <br />
      <br />
      <Input hasClear
        onChange={self.handleParaValueChange.bind(self, contractName, funcName, 'transferAssetValue')}
        style={{ ...styles.inputBoder, width: 600 }}
        innerBefore={T('转账资产金额')}
        size="medium"
        placeholder="多笔资产金额请用英文逗号分隔，跟资产ID需一一对应，如：100,10,1"
      />
    </Container>
  </div>
}

const TxReceiptResult = ({self, contractName, funcName}) => {
  return <div>
    <Button key='getTxInfo' type="primary" onClick={self.getTxInfo.bind(self, contractName, funcName)} style={{marginRight: '20px'}}>{T('查询交易')}</Button>
    <Button key='getReceiptInfo' type="primary" onClick={self.getReceiptInfo.bind(self, contractName, funcName)}>{T('查询Receipt')}</Button>
    <br /><br />
    {/* <Input  key='txReceiptResult' id={contractName + funcName + 'TxReceipt'} 
      value={self.state.result[contractName + funcName + 'TxReceipt']}
      multiple
      rows="5"
      style={{ width: 600 }}
      addonBefore={T("交易/Receipt信息:")}
      size="medium"
    /> */}
    {T('交易信息:')}<br />
    <ReactJson key='txInfoResult' id={contractName + funcName + 'TxInfo'} displayDataTypes={false} style={{backgroundColor: '#fff'}}
      src={utils.isEmptyObj(self.state.result[contractName + funcName + 'TxInfo']) ? {} : JSON.parse(self.state.result[contractName + funcName + 'TxInfo'])}
    />
    <br /> {T('Receipt信息:')}<br />
    <ReactJson key='receiptInfoResult' id={contractName + funcName + 'ReceiptInfo'} displayDataTypes={false} style={{backgroundColor: '#fff'}}
      src={utils.isEmptyObj(self.state.result[contractName + funcName + 'ReceiptInfo']) ? {} : JSON.parse(self.state.result[contractName + funcName + 'ReceiptInfo'])}
    />
  </div>
}

const Parameters = ({self, contractName, funcName, parameterNames, parameterTypes, width}) => {
  return parameterNames.map((paraName, index) => (
    <div>
      <Input key={paraName} hasClear
        onChange={self.handleParaValueChange.bind(self, contractName, funcName, paraName)}
        style={{ ...styles.inputBoder, width }}
        innerBefore={paraName}
        size="medium"
        placeholder={parameterTypes[index]}
        />
      <br /><br />
    </div>
  ))
}

const OneFunc = ({self, contractAccountName, contractName, funcName, parameterTypes, parameterNames}) => {
  let callBtnName = T('查询结果');
  if (!self.state.funcParaConstant[contractName][funcName]) {
    callBtnName = T('发起合约交易');
    const transferTogether = self.state.transferTogether[contractName + funcName];
    self.state.visibilityValue[contractName + funcName] = (transferTogether != null && transferTogether) ? 'block' : 'none';
  }
  return <Card style={{ width: 800, marginBottom: "20px" }} bodyHeight="auto" title={funcName}>
          <Parameters self={self} contractName={contractName} funcName={funcName} width='600px'
            parameterNames={parameterNames} parameterTypes={parameterTypes} />
          {
            self.state.funcPayable[contractName][funcName] ? 
              <Transfer self={self} contractName={contractName} funcName={funcName} /> : ''
          }
          <Button type="primary" onClick={self.callContractFunc.bind(self, contractAccountName, contractName, funcName)}>{callBtnName}</Button>
          <br />
          <br />
          <Input readOnly style={{ ...styles.inputBoder, width: 600 }} 
            value={self.state.result[contractName + funcName]}
            innerBefore={T('结果')} size="medium"/>
          <br />
          <br />
          {
            !self.state.funcParaConstant[contractName][funcName] ? 
              <TxReceiptResult self={self} contractName={contractName} funcName={funcName} /> : ''
          }
         </Card>;
}

const DisplayOneTypeFuncs = ({self, contract, abiInfos}) => {
  const {contractAccountName, contractName} = contract;

  return (<Collapse rtl='ltr'>
          {abiInfos.map((interfaceInfo, index) => {
            if (interfaceInfo.type === 'function') {
              const funcName = interfaceInfo.name;
              const parameterTypes = [];
              const parameterNames = [];
              for (const input of interfaceInfo.inputs) {
                parameterTypes.push(input.type);
                parameterNames.push(input.name);
              }

              self.state.funcParaTypes[contractName][funcName] = parameterTypes;
              self.state.funcParaNames[contractName][funcName] = parameterNames;
              self.state.funcResultOutputs[contractName][funcName] = interfaceInfo.outputs;
              self.state.funcParaConstant[contractName][funcName] = interfaceInfo.constant;
              self.state.funcPayable[contractName][funcName] = interfaceInfo.payable;
              return <Panel key={index}  title={funcName}>
                      <OneFunc key={contractAccountName + contractName + funcName} self={self} 
                        contractAccountName={contractAccountName} contractName={contractName} 
                        funcName={funcName} parameterTypes={parameterTypes} parameterNames={parameterNames}/>
                    </Panel>;      
            }
          })}
        </Collapse>);
}

const ContractArea = ({ self, contract }) => {
  const {contractAccountName, contractName} = contract;
  self.state.funcParaTypes[contractName] = {};
  self.state.funcParaNames[contractName] = {};
  self.state.funcParaConstant[contractName] = {};
  self.state.funcResultOutputs[contractName] = {};
  self.state.funcPayable[contractName] = {};

  const readonlyFuncs = [];
  const writableFuncs = [];
  const writablePayableFuncs = [];
  contract.contractAbi.map((interfaceInfo, index) => {
    if (interfaceInfo.type === 'function') {
      if (interfaceInfo.constant) {
        readonlyFuncs.push(interfaceInfo);
      } else if (interfaceInfo.payable) {
        writablePayableFuncs.push(interfaceInfo);
      } else {
        writableFuncs.push(interfaceInfo);
      }
    }
  }
  );
  return <Shell  style={{ width: '100%', minHeight: window.innerHeight - 200 }}>
          <Shell.Content>
            {T('只读类接口:')}<br/>
            <DisplayOneTypeFuncs self={self} abiInfos={readonlyFuncs} contract={contract}/>
            <br/>{T('写入类接口:')}<br/>
            <DisplayOneTypeFuncs self={self} abiInfos={writableFuncs} contract={contract}/>
            <br/>{T('写入并可支付类接口:')}<br/>
            <DisplayOneTypeFuncs self={self} abiInfos={writablePayableFuncs} contract={contract}/>
          </Shell.Content>
        </Shell>
      
} 

const ContractCollapse = ({self, contractAccountInfo}) => {
  global.localStorage.setItem('contractAccountInfo', JSON.stringify(contractAccountInfo));
  return <Collapse rtl='ltr'>
            {contractAccountInfo.map((contract, index) => (
              <Panel key={index}  
                title={T("编号:") + (index + 1) + '，' + T('合约账号:') + contract.contractAccountName 
                       + '，' + T('合约名:') + contract.contractName + '，' + T('创建时间:') + (contract.createDate == null ? T('未记录') : contract.createDate)}>
                <ContractArea self={self} contract={contract}/>
              </Panel>
            ))}
         </Collapse>
}

function CustomTabItem({ title, closeFunc }) {
  return (<Row justify='center' style={{color: '#fff'}}>
              {title}
              <Button text onClick={() => closeFunc(title)}><Icon size='xs' type='error'/></Button>
          </Row>);
}

export default class ContractManager extends Component {
  static displayName = 'ContractManager';

  constructor(props) {
    super(props);
    let abiInfoStr = '';
    const abiInfo = global.localStorage.getItem('abiInfo');
    if (abiInfo != null) {
      abiInfoStr = JSON.stringify(abiInfo).replace(/\\"/g, '"');
      abiInfoStr = abiInfoStr.substring(1, abiInfoStr.length - 1);
    }
    const abiContractName = cookie.load('abiContractName');
    this.state = {
      accountReg: new RegExp('^([a-z][a-z0-9]{6,15})(?:\.([a-z0-9]{2,16})){0,1}(?:\.([a-z0-9]{2,16})){0,1}$'),
      passwordReg: new RegExp('^([a-zA-Z0-9]{8,20})$'),
      accounts: [],
      accountsOfShareCode: [],
      contractFuncInfo: [],
      abiInfos: [],
      contractAccountInfo: [],
      contractAccountMap: {},
      accountContractInfoMap: {},
      contractAccountCreateTime: {},
      abiInfo: abiInfoStr,
      paraValue: {},
      funcParaTypes: {},
      funcParaNames: {},
      funcParaConstant: {},
      funcPayable: {},
      funcResultOutputs: {},      
      constructorParaNames: [],
      constructorParaTypes: [],
      result: {},
      txInfo: {},
      txSendVisible: false,
      defaultAccountName: '',
      contractName: abiContractName,
      contractAccount: abiContractName,
      selectedAccount: null,
      selectedAccountName: '',
      transferTogether: {},
      visibilityValue: {},
      curContractName: '',
      curCallFuncName: '',
      curTxResult: {},
      resultDetailInfo: '',
      solFileList: ['sample.sol'],
      tabFileList: ['sample.sol'],
      libFileList: [],
      smapleFileList: [],
      fileContractMap: {},
      contractList: [],
      contractAccountAbiMap: {},
      activeKey: '',
      addNewContractFileVisible: false,
      deployContractVisible: false,
      compileSrvSettingVisible: false,
      contractInfoVisible: false,
      displayAbiVisible: false,
      displayBinVisible: false,
      constructorVisible: false,
      curAbi: null,
      curBin: null,
      loadedContractAccount: '',
      compileSrv: '',
      selectContactFile: '',
      selectedFileToCompile: null,
      selectedContractToDeploy: null,
      resultInfo: '',
      newContractAccountName: '',
      keystoreInfo: {},
      suggestionPrice: 1,
      gasLimit: 10000000,
      ftAmount: 10,      
      createAccountVisible: false,
      shareCodeContract: {},
      chainConfig: null,
      collapse: false,
      width: '250px',
     };
     const solFileList = global.localStorage.getItem('solFileList');
     if (solFileList != null) {
       this.state.solFileList = solFileList.split(',').filter(fileName => fileName != null && fileName != '');
       if (this.state.solFileList.length > 0) {
        this.state.tabFileList = [this.state.solFileList[0]];
        this.state.activeKey = this.state.tabFileList[0];
       } else {
        this.state.tabFileList = [];
        this.state.activeKey = '';
       }
     }

     const contractAccountInfo = global.localStorage.getItem('contractAccountInfo');
     if (contractAccountInfo != null) {
      this.state.contractAccountInfo = JSON.parse(contractAccountInfo);
      this.state.contractAccountInfo.map(contractAccountInfo => {
        if (this.state.contractAccountMap[contractAccountInfo.solFileName + ':' + contractAccountInfo.contractName] == null) {
          this.state.contractAccountMap[contractAccountInfo.solFileName + ':' + contractAccountInfo.contractName] = contractAccountInfo.contractAccountName;
          this.state.accountContractInfoMap[contractAccountInfo.contractAccountName] = contractAccountInfo;
        }
      });
     }
     

     const contractList = global.localStorage.getItem('contractList');
     if (contractList != null) {
      this.state.contractList = JSON.parse(contractList);
     }

     const fileContractMap = global.localStorage.getItem('fileContractMap');
     if (fileContractMap != null) {
       this.state.fileContractMap = JSON.parse(fileContractMap);
     }
  }

  componentDidMount = async () => {
    this.state.chainConfig = await oexchain.oex.getChainConfig();
    oexchain.oex.setChainId(this.state.chainConfig.chainId);

    const keystoreList = utils.loadKeystoreFromLS();
    if (keystoreList != null) {
      for (const keystore of keystoreList) {
        this.state.keystoreInfo[keystore.publicKey] = keystore;
      }
    }    

    const accounts = await utils.loadAccountsFromLS();
    for (let account of accounts) {
      for (let author of account.authors) {
        if (this.state.keystoreInfo[author.owner] != null) {
          this.state.accounts.push({value: account.accountName, label: account.accountName, object: account});
          break;
        }
      }
    }
    
    let canceled = cookie.load('createFirstAccount');
    if (this.state.accounts.length > 0) {
      this.setState({ selectedAccountName: this.state.accounts[0].object.accountName, 
                      selectedAccount: this.state.accounts[0].object,
                      txSendVisible: false });
    } else if (!canceled) {
      this.state.selectedAccountName = utils.guid();
      this.state.selectedAccount = null;
      const chainId = oexchain.oex.getChainId();
      let netType = '私网';
      if (chainId == 1) {
        netType = '主网';
      } else if (chainId == 100) {
        netType = '测试网';
      }
      Dialog.confirm({
        title: '创建' + netType + '账户',
        content: '只有创建好账户后，才能正常使用合约部署和接口调用功能，否则只能编写和编译合约，请问需要是否创建账户？',
        messageProps:{
            type: 'warning'
        },
        okProps: {children: '创建账户', className: 'unknown'},
        onOk: () => {this.setState({createAccountVisible: true})},
        onCancel: () => { cookie.save('createFirstAccount', false, {path: '/'});}
      });
    }
    this.syncSolFileToSrv();
    
    const libFiles = await CompilerSrv.getLibSolFile();
    for(var fileName in libFiles) {
      this.state.libFileList.push(fileName);
      global.localStorage.setItem('sol:' + fileName, libFiles[fileName]);
    }
    
    const sampleFiles = await CompilerSrv.getSampleSolFile();
    for(var fileName in sampleFiles) {
      this.state.smapleFileList.push(fileName);
      global.localStorage.setItem('sol:' + fileName, sampleFiles[fileName]);
    }

    const abiInfo = global.localStorage.getItem('abiInfo');
    if (abiInfo != null) {
      let abiInfoStr = JSON.stringify(abiInfo).replace(/\\"/g, '"');
      abiInfoStr = abiInfoStr.substring(1, abiInfoStr.length - 1);
      this.setState({ storedAbiInfo: abiInfoStr, txSendVisible: false });
    }

    oexchain.oex.getSuggestionGasPrice().then(suggestionPrice => {
      this.setState({ gasPrice: utils.getReadableNumber(suggestionPrice, 9, 9), txSendVisible: false });
    })
  }

  initContract = () => {
    Constant.ShareCoding.map((interfaceInfo, index) => {
      if (interfaceInfo.type === 'function') {
        
      }
    }
    );
  }

  parseConstructorInputs = (contractAbi) => {
    this.state.constructorParaNames = [];
    this.state.constructorParaTypes = [];
    for (let interfaceInfo of contractAbi) {
      if (interfaceInfo.type == 'constructor') {
        for (let input of interfaceInfo.inputs) {
          this.state.constructorParaNames.push(input.name);
          this.state.constructorParaTypes.push(input.type);
        }
        return;
      }
    }
  }

  syncSolFileToSrv = () => {
    for (const solFile of this.state.solFileList) {
     const solCode = global.localStorage.getItem('sol:' + solFile);
     CompilerSrv.updateSol(this.state.selectedAccountName, solFile, solCode);
    }
  }

  getAccountPublicKey = () => {
    for (let author of this.state.selectedAccount.authors) {
      if (this.state.keystoreInfo[author.owner] != null) {
        return author.owner;
      }
    }
    return '';
  }

  handleContractAccountChange = (value) => {
    this.state.contractAccount = value;
  }

  saveContractName = (value) => {
    this.state.contractName = value.currentTarget.defaultValue;
    cookie.save('abiContractName', this.state.contractName);
  }

  handleABIInfoChange = (value) => {
    this.setState({ abiInfo: value, txSendVisible: false });
  }

  checkABI = (abiInfo) => {
    if (utils.isEmptyObj(abiInfo) 
    || (!utils.isEmptyObj(abiInfo) && !oexchain.utils.isValidABI(abiInfo))) {
      Feedback.toast.error(T('ABI信息不符合规范，请检查后重新输入'));
      return false;
    }
    return true;
  }

  handleParaValueChange = (contractName, funcName, paraName, value) => {
    this.state.paraValue[contractName + '-' + funcName + '-' + paraName] = value;
  }

  onChangeAccount = (accountName, item) => {
    this.state.selectedAccountName = accountName;
    this.state.selectedAccount = item.object;
    this.setState({ selectedAccountName: accountName, selectedAccount: item.object, txSendVisible: false });
    this.syncSolFileToSrv();
  }

  selectShareCodeAccount = () => {

  }

  syncContracts = () => {

  }

  giveReward = () => {

  }


  handleContractNoChange = (v) => {
    this.state.contractIndex = v;
  }

  changeLog = (v) => {
    this.state.resultInfo = v;
    this.setState({resultInfo: this.state.resultInfo});
  }

  removeContractCall = () => {
    if (utils.isEmptyObj(this.state.contractIndex)) {
      Feedback.toast.error(T('请输入待删除合约界面的编号'));
      return;
    }
    const index = parseInt(this.state.contractIndex);
    if (index > this.state.contractAccountInfo.length || index < 1) {
      Feedback.toast.error('当前编号必须大于0，小于等于' + this.state.contractAccountInfo.length);
      return;
    }
    this.state.contractAccountInfo.splice(index - 1, 1);
    this.setState({contractAccountInfo: this.state.contractAccountInfo, txSendVisible: false});
  }

  onChangeContractFile = (fileToCompile) => {
    this.setState({ selectedFileToCompile: fileToCompile, txSendVisible: false });
  }

  onChangeContract = (contractToDeploy) => {
    const contractInfo = contractToDeploy.split(':');      
    const contractCode = this.state.fileContractMap[contractInfo[0]][contractInfo[1]];
    const oneContractABI = JSON.parse(contractCode.abi);
    if (oneContractABI != null) {
      this.parseConstructorInputs(oneContractABI);
    }

    this.setState({ selectedContractToDeploy: contractToDeploy, txSendVisible: false });
  }

  handleLoadedContractAccountChange = (v) => {
    this.setState({ loadedContractAccount: v, txSendVisible: false });
  }

  loadContract = () => {
    if (utils.isEmptyObj(this.state.loadedContractAccount)) {
      Feedback.toast.error(T('请输入合约账号'));
      return;
    }
    oexchain.account.getAccountByName(this.state.loadedContractAccount).then(async (account) => {
      if (account == null) {
        Feedback.toast.error(T('此账号不存在'));
        return;
      }
      if (account.codeSize == 0) {
        Feedback.toast.error(T('此账号非合约账号，无法加载'));
        return;
      }
      const contractAbi = utils.getContractABI(this.state.loadedContractAccount);
      if (!utils.isEmptyObj(contractAbi)) {
        const contractName = this.getContractName(this.state.loadedContractAccount);
        this.displayContractFunc(this.state.loadedContractAccount, 
                                 'tmpFile-' + utils.getRandomInt(10000),
                                 utils.isEmptyObj(contractName) ? 'tmpName-' + utils.getRandomInt(10000) : contractName , 
                                 contractAbi);
        return;
      } else {
        const bURC20 = await utils.checkURC20(this.state.loadedContractAccount);
        if (bURC20) {
          this.displayContractFunc(this.state.loadedContractAccount, 
                                   'tmpFile-' + utils.getRandomInt(10000),
                                   'URC20-' + utils.getRandomInt(10000), Constant.URC20ABI);
          return;
        }
      }
      this.setState({ contractInfoVisible: true, txSendVisible: false });
    });
  }
  addLog = (logInfo) => {
    let date = new Date().toLocaleString();
    logInfo = date + ':' + logInfo + '\n\n';
    this.setState({resultInfo: this.state.resultInfo + logInfo, txSendVisible: false});
  }

  copyAccount = () => {
    if (utils.isEmptyObj(this.state.selectedAccountName) || this.state.selectedAccountName.indexOf('-') > 0) {
      Feedback.toast.error(T('请先选择账号'));
      return;
    }
    copy(this.state.selectedAccountName);
    Feedback.toast.success(T('账号已拷贝到粘贴板'));
  }

  shareCode = () => {
    Dialog.confirm({
      title: '分享您的合约代码',
      content: '确认分享后，您的合约代码可被平台其他用户实时查看，并接受他们的打赏（出于自愿）。',
      messageProps:{
          type: 'success'
      },
      okProps: {children: '分享代码', className: 'unknown'},
      onOk: () => {this.shareCodeTx();},
      onCancel: () => { }
    });
  }

  shareCodeTx = () => {

  }

  createAccount = () => {

  }

  compileContract = async () => {
    this.state.selectedFileToCompile = this.state.selectContactFile;
    if (this.state.selectedFileToCompile.length == 0) {
      Feedback.toast.error(T('请选择待编译的文件'));
      return;
    }
    this.addLog(T("开始编译合约文件：") + this.state.selectedFileToCompile);
    const compileResult = await CompilerSrv.compileSol(this.state.selectedAccountName, this.state.selectedFileToCompile);
    if (compileResult.err != null) {
      Feedback.toast.error(T("编译失败"));
      this.addLog(compileResult.err);
      return;
    }
    Feedback.toast.success(T("编译成功"));
    this.addLog(T("编译成功"));

    this.state.fileContractMap[this.state.selectedFileToCompile] = compileResult;
    this.state.contractList = [];
    for (var contractFile in this.state.fileContractMap) {
      const compiledInfo = this.state.fileContractMap[contractFile];
      for (var contractName in compiledInfo) {
        this.state.contractList.push(contractFile + ":" + contractName);
        if (contractFile == this.state.selectedFileToCompile)
          this.addLog(T("合约 ") + contractName + T(" 编译结果") + '\n' + compiledInfo[contractName].abi);
      }
    }
    global.localStorage.setItem("contractList", JSON.stringify(this.state.contractList));
    global.localStorage.setItem("fileContractMap", JSON.stringify(this.state.fileContractMap));
    if (this.state.selectedContractToDeploy != null 
      && this.state.selectedContractToDeploy.indexOf(this.state.selectedFileToCompile) > -1) {
        this.state.selectedContractToDeploy = "";
        this.state.constructorParaNames = [];
        this.state.constructorParaTypes = [];
    }
    this.setState({contractList: this.state.contractList, selectedContractToDeploy: this.state.selectedContractToDeploy, txSendVisible: false});
  }
  setCompileSrv = () => {
    this.setState({compileSrvSettingVisible: true, txSendVisible: false});
  }
  // 部署合约分两步：
  // 1:创建账户，需：账户名(自动生成), 公钥(同发起账户)，转OEX金额(用于部署合约)
  // 2:将合约bytecode附加到第一步创建的账户中
  deployContract = async () => {
    this.state.selectedContractToDeploy = this.state.selectContactFile;
    if (this.state.selectedContractToDeploy == null || !this.state.selectedContractToDeploy.endsWith('.bin')) {
      Feedback.toast.error(T('请选择需要部署的合约bin文件'));
      return;
    }
    this.state.selectedContractToDeploy = this.state.selectedContractToDeploy.substr(0, this.state.selectedContractToDeploy.length - 4);
    this.state.newContractAccountName = await this.generateContractAccount();
    this.state.newContractPublicKey = this.getAccountPublicKey();
    if (this.state.constructorParaNames.length > 0) {
      this.setState({constructorVisible: true});
    } else {
      this.setState({deployContractVisible: true, txSendVisible: false});
    }
  }

  onConstructOK = () => {
    this.setState({deployContractVisible: true, txSendVisible: false});
  }

  displayAbi = () => {
    if (this.state.selectedContractToDeploy == null) {
      Feedback.toast.error(T('请选择合约'));
      return;
    }
    const contractInfo = this.state.selectedContractToDeploy.split(':');      
    const contractCode = this.state.fileContractMap[contractInfo[0]][contractInfo[1]];
    if (contractCode == null) {
      Feedback.toast.error(T('无此合约编译信息'));
      return;
    }
    this.setState({curAbi: JSON.parse(contractCode.abi), displayAbiVisible: true, txSendVisible: false});
  }
  displayBin = () => {
    if (this.state.selectedContractToDeploy == null) {
      Feedback.toast.error(T('请选择合约'));
      return;
    }
    const contractInfo = this.state.selectedContractToDeploy.split(':');      
    const contractCode = this.state.fileContractMap[contractInfo[0]][contractInfo[1]];
    if (contractCode == null) {
      Feedback.toast.error(T('无此合约编译信息'));
      return;
    }
    this.setState({curBin: contractCode.bin, displayBinVisible: true, txSendVisible: false});
  }
  generateContractAccount = async () => {
    const nonce = await oexchain.account.getNonce(this.state.selectedAccountName);
    const shaResult = sha256.hex_sha256(this.state.selectedAccountName + nonce).substr(2);
    if (shaResult.charAt(0) > 'a' && shaResult.charAt(0) < 'z') {
      return shaResult.substr(0, 12);
    } else {
      return 'x' + shaResult.substr(0, 11);
    }
  }

  callContractFunc = async (contractAccountName, contractName, funcName) => {
    try {      
      if (utils.isEmptyObj(this.state.selectedAccountName)) {
        Feedback.toast.error(T('请选择发起合约调用的账号'));
        return;
      }

      if (utils.isEmptyObj(contractAccountName)) {
        Feedback.toast.error(T('请输入合约账号名'));
        return;
      }
      const contractAccount = await oexchain.account.getAccountByName(contractAccountName);
      if (contractAccount == null) {
        Feedback.toast.error(T('合约不存在，请检查合约名是否输入错误'));
        return;
      }
      const paraNames = this.state.funcParaNames[contractName][funcName];
      const values = [];
      let index = 0;
      for (const paraName of paraNames) {
        const value = this.state.paraValue[contractName + '-' + funcName + '-' + paraName];
        if (value == null) {
          Feedback.toast.error(T('参数') + paraName + T('尚未输入值'));
          return;
        }
        const type = this.state.funcParaTypes[contractName][funcName][index];
        if (type == 'bool') {
          value = (value == 'false' || value == 0) ? false : true;
          values.push(value);
        } else if (type.lastIndexOf(']') === type.length - 1) {
          if (value.indexOf('[') != 0 || value.lastIndexOf(']') != value.length - 1) {
            Feedback.toast.error('数组类型的值请按如下格式填写：[a,b,c]');
            return;
          }          
          values.push(value.substr(1, value.length - 2).split(','));
        } else {
          values.push(value);
        }
        index++;
      }
      const self = this;
      const assetAmountMap = {};
      assetAmountMap[this.state.chainConfig.SysTokenId] = '0';
      let payload = '0x' + oexchain.utils.getContractPayload(funcName, this.state.funcParaTypes[contractName][funcName], values);
      if (this.state.funcParaConstant[contractName][funcName]) {
        const callInfo = {actionType:0, from: 'oexchain.founder', to: contractAccountName, assetId:0, gas:200000000, gasPrice:10000000000, value:0, data:payload, remark:''};
        oexchain.oex.call(callInfo, 'latest').then(resp => {
          const ret = utils.parseResult(self.state.funcResultOutputs[contractName][funcName], resp);
          this.addLog("调用函数" + funcName + "获得的结果：" + ret);
          self.state.result[contractName + funcName] = ret;
          self.setState({ result: self.state.result, txSendVisible: false });
        });
      } else {
        let assetIds = [0];
        let amounts = [0];        
        if (this.state.transferTogether[contractName + funcName]) {
          assetIds = this.state.paraValue[contractName + '-' + funcName + '-transferAssetId'];
          amounts = this.state.paraValue[contractName + '-' + funcName + '-transferAssetValue'];      
          if (utils.isEmptyObj(assetIds) || utils.isEmptyObj(amounts)) {
            Feedback.toast.error(T('请输入要转移给合约的资产及其金额'));
            return;
          }
          assetIds = assetIds.trim().split(',');
          amounts = amounts.trim().split(',');
          for (let i = 0; i < assetIds.length; i++) {
            const assetId = assetIds[i].trim();
            const amount = amounts[i].trim();
            if (utils.isEmptyObj(assetId) || utils.isEmptyObj(amount)) {
              Feedback.toast.error(T('资产ID和金额不能为空，请检查输入是否正确'));
              return;
            }
            if (assetAmountMap[assetId] != null) {
              Feedback.toast.error(T('输入的资产不可重复，请检查输入'));
              return;
            }
            assetAmountMap[assetId] = amount;
          }
        }
        let oexAmount = assetAmountMap[this.state.chainConfig.SysTokenId];
        if (!utils.isEmptyObj(oexAmount)) {
          oexAmount = parseInt(oexAmount);
        }

        // 如果用户只转一种资产，无论是何种资产，都放到action里
        // 如果用户转多种资产，当资产中有OEX的时候，将OEX放入action，其它资产放到payload里，
        //                  否则将所有资产都放入payload里
        let actionAssetId = 0;
        let actionAmount = 0;
        if (assetIds.length == 1) {   // 只转一种币
          actionAssetId = assetIds[0];
          actionAmount = amounts[0];
        } else {   // 转多种币
            const extraAssetInfo = [];
            if (assetAmountMap[this.state.chainConfig.SysTokenId] != null) {  // 带有平台币的情况
              actionAssetId = this.state.chainConfig.SysTokenId;
              actionAmount = assetAmountMap[this.state.chainConfig.SysTokenId];
              assetIds.map((assetId, i) => {
                if (assetId != this.state.chainConfig.SysTokenId) {
                  extraAssetInfo.push({assetId, amount: amounts[i]});
                }
              });
            } else {  // 不带平台币的情况
              assetIds.map((assetId, i) => {
                extraAssetInfo.push({assetId, amount: amounts[i]});
              });
            }
            payload = '0x' + encode([...extraAssetInfo, payload]).toString('hex');
        }
        
        this.state.txInfo = { actionType: Constant.CALL_CONTRACT,
          toAccountName: contractAccountName,
          assetId: this.state.chainConfig.SysTokenId,
          amount: oexAmount,
          payload };
        this.setState({ txSendVisible: true, curContractName: contractName, curCallFuncName: funcName });
      }
    } catch (error) {
      this.addLog('函数调用失败:' + error);
      Feedback.toast.error('函数调用失败：' + error);
    }
  }

  getTxInfo = (contractName, funcName) => {
    const txHash = this.state.curTxResult[contractName][funcName];
    if (txHash != null) {
      if (txHash.indexOf('0x') != 0) {
        Feedback.toast.error(T('非交易hash，无法查询'));
        return;
      }
      oexchain.oex.getTransactionByHash(txHash).then(txInfo => {        
        this.addLog("交易信息\n" + JSON.stringify(txInfo));
        this.state.result[contractName + funcName + 'TxInfo'] = JSON.stringify(txInfo);
        this.setState({result: this.state.result, txSendVisible: false});
      });
    }
  }

  getReceiptInfo = (contractName, funcName) => {
    const txHash = this.state.curTxResult[contractName][funcName];
    if (txHash != null) {
      if (txHash.indexOf('0x') != 0) {
        Feedback.toast.error(T('非交易hash，无法查询'));
        return;
      }
      oexchain.oex.getTransactionReceipt(txHash).then(receipt => {        
        if (receipt == null) {
          Feedback.toast.error(T('receipt尚未生成'));
          return;
        }
        this.addLog("receipt\n" + JSON.stringify(receipt));
        this.state.result[contractName + funcName + 'ReceiptInfo'] = JSON.stringify(receipt);
        this.setState({result: this.state.result, txSendVisible: false});
        const actionResults = receipt.actionResults;
        if (actionResults[0].status == 0) {
          Feedback.toast.error(T('Receipt表明本次交易执行失败，原因') + ':' + actionResults[0].error);
        } else {
          Feedback.toast.success(T('Receipt表明本次交易执行成功'));
        }
      });
    }
  }

  getTxResult = (result) => {
    this.addLog("调用函数" + this.state.curCallFuncName + "获取的结果:" + result);
    this.state.result[this.state.curContractName + this.state.curCallFuncName] = result;
    this.setState({result: this.state.result, txSendVisible: false});
    this.state.curTxResult[this.state.curContractName] = {};
    this.state.curTxResult[this.state.curContractName][this.state.curCallFuncName] = result;
  }

  selectTab = (key) => {
    this.setState({activeKey: key, txSendVisible: false});
  }

  addSolTab = (fileName) => {
    if (fileName == null) {
      return;
    }
    let exist = false;
    this.state.tabFileList.map(tabFileName => {
      if (fileName == tabFileName) {
        exist = true;
      }
    });
    if (exist) {
      this.setState({activeKey: fileName, txSendVisible: false});
    } else {
      this.state.tabFileList.push(fileName);
      this.setState({activeKey: fileName, tabFileList: this.state.tabFileList, txSendVisible: false});
    }
  }

  delSolTab = (fileName) => {
    let index = this.state.tabFileList.indexOf(fileName);
    if (index > -1) {
      this.state.tabFileList.splice(index, 1);
    }
    if (index >= this.state.tabFileList.length) {
      index = this.state.tabFileList.length - 1;
    }
    this.setState({tabFileList: this.state.tabFileList, activeKey: index >= 0 ? this.state.tabFileList[index] : '', txSendVisible: false});
  }

  updateSolTab = (oldFileName, newFileName) => {
    const index = this.state.tabFileList.indexOf(oldFileName);
    if (index > -1) {
      this.state.tabFileList.splice(index, 1, newFileName);
    }
    let activeLabKey = this.state.activeKey;
    if (activeLabKey == oldFileName) {
      activeLabKey = newFileName;
    }

    const solCode = global.localStorage.getItem('sol:' + oldFileName);
    global.localStorage.setItem('sol:' + newFileName, solCode);
    global.localStorage.removeItem('sol:' + oldFileName);

    this.setState({activeKey: activeLabKey, tabFileList: this.state.tabFileList, txSendVisible: false});
  }

  onClose = (targetKey) => {
    this.delSolTab(targetKey);
  }

  onEditFinish(key, label, node) {
    this.state.solFileList.map((solFileName, index) => {
      if (solFileName == key) {        
        this.state.solFileList[index] = label;
      }
    });
    if (this.state.selectedFileToCompile == key) {
      this.state.selectedFileToCompile = label;
    }
    this.state.contractList.map((contractFile, index) => {
      const contractInfos = contractFile.split(":");
      if (contractInfos[0] == key) {        
        this.state.contractList[index] = label + ":" + contractInfos[1];
      }
    });
    if (this.state.selectedContractToDeploy != null && this.state.selectedContractToDeploy.split(":")[0] == key) {
      this.state.selectedContractToDeploy = label + ":" + this.state.selectedContractToDeploy.split(":")[1];
    }

    this.setState({solFileList: this.state.solFileList, contractFile: this.state.contractList, txSendVisible: false});
    this.updateSolTab(key, label);
    CompilerSrv.renameSol(this.state.selectedAccountName, key, label);
  }

  onRightClick(info) {
    console.log('onRightClick', info);
  }
  
  isDisplayedFile(nodeName) {
    return nodeName.endsWith('.ui') || nodeName.endsWith('.bin') || nodeName.endsWith('.abi') || nodeName.endsWith('.sol');
  }

  onSelectSolFile = (selectedKeys) => {
    console.log('onSelectSolFile', selectedKeys);
    this.state.selectContactFile = selectedKeys[0];
    if (this.state.selectContactFile != null && this.isDisplayedFile(selectedKeys[0]))
      this.addSolTab(this.state.selectContactFile);
  }
  
  addSolFile = () => {
    this.setState({addNewContractFileVisible: true, txSendVisible: false});
  }
  
  handleContractNameChange = (value) => {
    this.state.newContractFileName = value;
  }
  
  handleContractAccountNameChange = (value) => {
    this.setState({newContractAccountName: value});
  }
  
  handleContractPublicKeyChange = (value) => {
    this.setState({newContractPublicKey: value});
  }
  
  handleFTAmountChange = (value) => {
    this.setState({ftAmount: value});
  }
  
  handleGasPriceChange(v) {
    this.state.gasPrice = v;
  }
  handleGasLimitChange(v) {
    this.state.gasLimit = parseInt(v);
  }
  handlePasswordChange = (v) => {
    this.state.password = v;
  }
  onAddNewContractFileOK = () => {
    if (this.state.newContractFileName.search(/[:~!@#$%\^&*()<>?,]/) > -1) {
      Feedback.toast.error('不可包含特殊字符');
      return;
    }
    if (!this.state.newContractFileName.endsWith('.sol')) {
      this.state.newContractFileName += '.sol';
    }
    let exist = false;
    this.state.solFileList.map(contractFileName => {
      if (this.state.newContractFileName == contractFileName) {
        exist = true;
      }
    });
    if (exist) {
      Feedback.toast.error('文件已存在！');
      return;
    }

    this.state.solFileList.push(this.state.newContractFileName);
    this.setState({solFileList: this.state.solFileList, activeKey: this.state.newContractFileName, addNewContractFileVisible: false});
    this.addSolTab(this.state.newContractFileName);
    
    CompilerSrv.addSol(this.state.selectedAccountName, this.state.newContractFileName);
  }

  onAddNewContractFileClose = () => {
    this.setState({addNewContractFileVisible: false});
  }

  handleCompileSrvChange = (v) => {
    this.state.compileSrv = v;
  }

  onSetCompileSrvClose = () => {
    this.setState({compileSrvSettingVisible: false, txSendVisible: false});
  }  

  onAddContractABIOK = () => {
    if (!utils.isEmptyObj(this.state.contractABI) && !oexchain.utils.isValidABI(JSON.parse(this.state.contractABI))) {
      Feedback.toast.error(T('ABI信息不符合规范，请检查后重新输入'));
      return;
    }
    utils.storeContractABI(this.state.loadedContractAccount, JSON.parse(this.state.contractABI));
    const contractName = this.getContractName(this.state.loadedContractAccount);
    this.displayContractFunc(this.state.loadedContractAccount, utils.isEmptyObj(contractName) ? 'tmpName-' + utils.getRandomInt(10000) : contractName , JSON.parse(this.state.contractABI));
    this.setState({ contractInfoVisible: false });
  }

  onAddContractABIClose = () => {
    this.setState({ contractInfoVisible: false });
  }

  onDisplayABIOK = () => {
    copy(JSON.stringify(this.state.curAbi));
    Feedback.toast.success(T('ABI信息已拷贝到粘贴板'));
  }

  onDisplayABIClose = () => {
    this.setState({ displayAbiVisible: false });
  }

  onDisplayBINOK = () => {
    copy(this.state.curBin);
    Feedback.toast.success(T('BIN信息已拷贝到粘贴板'));
  }

  onDisplayBINClose = () => {
    this.setState({ displayBinVisible: false });
  }

  handleContractABIChange = (value) => {
    this.state.contractABI = value;
  }

  getFTBalance = (account) => {
    for(const balance of account.balances) {
      if (balance.assetID == Constant.SysTokenId) {
        return balance.balance;
      }
    }
    return 0;
  }
  checkBalanceEnough = (account, gasPrice, gasLimit, transferAmount) => {
    const ftBalance = this.getFTBalance(account);
    const gasValue = new BigNumber(gasPrice).multipliedBy(gasLimit).shiftedBy(9);
    const maxValue = new BigNumber(ftBalance);
    if (gasValue.comparedTo(maxValue) > 0) {
      return false;
    }
    const value = new BigNumber(transferAmount);
    const valueAddGasFee = value.plus(gasValue);

    if (valueAddGasFee.comparedTo(maxValue) > 0) {
      return false;
    }
    return true;
  }

  getSignIndex = (account, walletInfo) => {
    const authors = account.authors;
    let index = 0;
    for (const author of authors) {
      const owner = author.owner.toLowerCase();
      if (owner == walletInfo.signingKey.address.toLowerCase() || owner == walletInfo.signingKey.publicKey.toLowerCase()) {
        return index;
      }
      index++;
    }
    return -1;
  }

  sendTx = async (txInfo, fromAccount) => {
    const authors = fromAccount.authors;
    let threshold = fromAccount.threshold;
    const keystores = utils.getValidKeystores(authors, threshold);
    if (keystores.length > 0) {
      let multiSigInfos = [];
      let promiseArr = [];
      for (const ethersKSInfo of keystores) {
        promiseArr.push(ethers.Wallet.fromEncryptedJson(JSON.stringify(ethersKSInfo), this.state.password));
      }

      const wallets = await Promise.all(promiseArr);
      for (let wallet of wallets) {
        const signInfo = await oexchain.oex.signTx(txInfo, wallet.privateKey);
        const index = this.getSignIndex(fromAccount, wallet);
        multiSigInfos.push({signInfo, indexes: [index]});
      }
      const actionName = txParser.getActionTypeStr(txInfo.actions[0].actionType);
      if (multiSigInfos.length > 0) {   
        Feedback.toast.success(fromAccount.accountName + '开始发送交易:' + actionName);   
        this.addLog(fromAccount.accountName + '开始发送交易:' + actionName + ', 交易详情:' + JSON.stringify(txInfo));    
        const fatherLevel = 0;
        return oexchain.oex.sendSeniorSigTransaction(txInfo, multiSigInfos, fatherLevel);
        
        // .then(txHash => {
        //   this.addLog(actionName + '的交易hash:' + txHash);
        //   this.checkReceipt(actionName, txHash, cbFunc);
        // }).catch(error => {
        //   this.addLog(actionName + '交易发送失败:' + error);
        //   Feedback.toast.error('交易发送失败：' + error);
        // });
      }
    } else {
      Feedback.toast.error('由于您对创建者账户拥有的权限不足，无法使用此账户');
    }
  }

  checkReceipt = (actionName, txHash, cbFunc) => {
    let count = 0;
    const intervalId = setInterval(() => {
      oexchain.oex.getTransactionReceipt(txHash).then(receipt => {
        if (receipt == null) {
          Feedback.toast.success('进行中。。。');
          this.addLog('receipt尚未生成，继续查询');
          count++;
          if (count == 3) {
            this.addLog('receipt生成超时，请检查链是否正常');
            clearInterval(intervalId);
          }
        } else {
          this.addLog('receipt已生成');
          clearInterval(intervalId);
          const actionResults = receipt.actionResults;
          if (actionResults[0].status == 0) {
            Feedback.toast.error(actionName + T('交易执行失败，原因') + ':' + actionResults[0].error);
          } else if (cbFunc != null) {
            cbFunc();
          }
        }
      });
    }, 3000);
  }

  createAccountTx = (newAccountName, creator, publicKey, transferFTAmount, gasPrice, gasLimit) => {
    const payload = '0x' + encode([newAccountName, creator.accountName, publicKey, '']).toString('hex');
    let amountValue = new BigNumber(transferFTAmount).shiftedBy(Constant.SysTokenDecimal);
    amountValue = amountValue.comparedTo(new BigNumber(0)) == 0 ? 0 : '0x' + amountValue.toString(16);
    const txInfo = {};
    const actionInfo = { actionType: Constant.CREATE_NEW_ACCOUNT,
      accountName: creator.accountName,
      toAccountName: 'oexchain.account',  // oexchain.account
      assetId: Constant.SysTokenId,
      gasLimit,
      amount: amountValue,
      payload };
    txInfo.gasAssetId = Constant.SysTokenId;  // ft作为gas asset
    txInfo.gasPrice = new BigNumber(gasPrice).shiftedBy(9).toNumber();
    txInfo.actions = [actionInfo];

    return this.sendTx(txInfo, creator);
  }

  storeContractName = (contractAccountName, contractName) => {
    let storedName = utils.getDataFromFile(Constant.ContractNameFile);
    if (storedName != null) {
      storedName[contractAccountName] = contractName;
    } else {
      storedName = {};
      storedName[contractAccountName] = contractName;
    }
    utils.storeDataToFile(Constant.ContractNameFile, storedName);
  }
  
  getContractName = (contractAccountName) => {
    let storedName = utils.getDataFromFile(Constant.ContractNameFile);
    if (storedName != null) {
      return storedName[contractAccountName];
    }
    return null;
  }

  deployContractTx = async (contractAccountName, contractCode, gasPrice, gasLimit) => {
    const contractAccount = await oexchain.account.getAccountByName(contractAccountName);
    const payload = '0x' + contractCode;
    const txInfo = {};
    const actionInfo = { actionType: Constant.CREATE_CONTRACT,
      accountName: contractAccountName,
      toAccountName: contractAccountName,
      assetId: Constant.SysTokenId,
      gasLimit,
      amount: 0,
      payload };
    txInfo.gasAssetId = Constant.SysTokenId;  // ft作为gas asset
    txInfo.gasPrice = new BigNumber(gasPrice).shiftedBy(9).toNumber();
    txInfo.actions = [actionInfo];
    
    return this.sendTx(txInfo, contractAccount);
  }
  onDeployContractOK = async () => {
    if (this.state.newContractAccountName == null) {
      Feedback.toast.error(T('请输入合约账户名'));
      return;
    }

    if (utils.isEmptyObj(this.state.gasPrice)) {
      Feedback.toast.error(T('请输入GAS单价'));
      return;
    }

    if (utils.isEmptyObj(this.state.gasLimit)) {
      Feedback.toast.error(T('请输入愿意支付的最多GAS数量'));
      return;
    }

    if (utils.isEmptyObj(this.state.password)) {
      Feedback.toast.error(T('请输入钱包密码'));
      return;
    }

    if (!this.state.accountReg.test(this.state.newContractAccountName) && this.state.newContractAccountName.length > 31) {
      Feedback.toast.error(T('账号格式错误'));
      return;
    }
    
    const contractInfo = this.state.selectedContractToDeploy.split(':');      
    const contractCode = this.state.fileContractMap[contractInfo[0]][contractInfo[1]];
    if (contractCode == null) {
      Feedback.toast.error(T('无此合约编译信息'));
      return;
    }

    const values = [];
    let index = 0;
    for (let paraName of this.state.constructorParaNames) {
      let value = this.state.paraValue[this.state.curContractName + '-constructor-' + paraName];
      if (value == null) {
        Message.error(T('参数') + paraName + T('尚未输入值'));
        return;
      }
      const type = this.state.constructorParaTypes[index];
      if (type == 'bool') {
        value = ((value == 'false' || value == 0) ? false : true);
        values.push(value);
      } else if (type.lastIndexOf(']') === type.length - 1) {
        if (value.indexOf('[') != 0 || value.lastIndexOf(']') != value.length - 1) {
          Message.error(T('数组类型的值请按如下格式填写:' + '[a,b,c]'));
          return;
        }          
        values.push(value.substr(1, value.length - 2).split(','));
      } else {
        values.push(value);
      }
      index++;
    }
    const constructorPayload = abiUtil.rawEncode(this.state.constructorParaTypes, values).toString('hex');

    Feedback.toast.success(T('开始部署合约'));
    this.addLog(T('开始部署合约'));
    const contractAccount = await oexchain.account.getAccountByName(this.state.newContractAccountName);
    if (contractAccount != null) {
      if (!this.checkBalanceEnough(contractAccount, this.state.gasPrice, this.state.gasLimit, this.state.ftAmount)) {        
        Feedback.toast.error(T('OEX余额不足，无法发起交易'));
        return;
      }
      // 由合约账户直接发起部署合约的操作
      this.deployContractTx(this.state.newContractAccountName, contractCode.bin + constructorPayload, this.state.gasPrice, this.state.gasLimit).then(txHash => {
        this.addLog(T('部署合约的交易hash:') + txHash);
        this.checkReceipt(T('部署合约'), txHash, () => {
          Feedback.toast.success(T('成功部署合约'));
          this.setState({deployContractVisible: false, txSendVisible: false});
          this.processContractDepolyed(this.state.newContractAccountName, contractInfo[0], contractInfo[1], JSON.parse(contractCode.abi));
        });
      }).catch(error => {
        this.addLog(T('部署合约交易发送失败:') + error);
        Feedback.toast.error(T('部署合约交易发送失败:') + error);
      });
      Feedback.toast.success(T('开始发送交易'));
    } else {
      if (utils.isEmptyObj(this.state.selectedAccountName)) {
        Feedback.toast.error(T('请选择创建者账号'));
        return;
      }

      if (utils.isEmptyObj(this.state.newContractPublicKey)) {
        Feedback.toast.error(T('请输入合约账户的公钥'));
        return;
      }

      if (utils.isEmptyObj(this.state.ftAmount)) {
        Feedback.toast.error(T('请输入OEX转账金额'));
        return;
      }
      
      const publicKey = utils.getPublicKeyWithPrefix(this.state.newContractPublicKey);
      if (!ethUtil.isValidPublic(Buffer.from(utils.hex2Bytes(publicKey)), true)) {
        Feedback.toast.error(T('无效公钥，请重新输入'));
        return;
      }
      if (!this.checkBalanceEnough(this.state.selectedAccount, this.state.gasPrice, this.state.gasLimit, this.state.ftAmount)) {        
        Feedback.toast.error(T('OEX余额不足，无法发起交易'));
        return;
      }
      // 1:由发起账户创建合约账户
      this.createAccountTx(this.state.newContractAccountName, this.state.selectedAccount, publicKey,
                           this.state.ftAmount, this.state.gasPrice, this.state.gasLimit).then(txHash => {
        this.addLog(T('创建账户的交易hash:') + txHash);
        this.checkReceipt(T('创建账户'), txHash, () => {
          // 2:由合约账户部署合约
          Feedback.toast.success(T('合约账户创建成功，即将为账户添加合约代码'));  
          this.addLog(T('合约账户已创建，可部署合约'));    
          this.deployContractTx(this.state.newContractAccountName, contractCode.bin + constructorPayload, this.state.gasPrice, this.state.gasLimit).then(txHash => {
            this.addLog(T('部署合约的交易hash:') + txHash);
            this.checkReceipt(T('部署合约'), txHash, () => {
              Feedback.toast.success(T('成功部署合约')); 
              this.setState({deployContractVisible: false, txSendVisible: false}); 
              this.processContractDepolyed(this.state.newContractAccountName, contractInfo[0], contractInfo[1], JSON.parse(contractCode.abi));
            });
          }).catch(error => {
            this.addLog(T('部署合约交易发送失败:') + error);
            Feedback.toast.error(T('部署合约交易发送失败:') + error);
          });
        });
      });
    }
  }

  processContractDepolyed = (contractAccountName, solFileName, contractName, contractAbi) => {
    if (this.checkABI(contractAbi)) {
      this.displayContractFunc(contractAccountName, solFileName, contractName, contractAbi);
      this.storeContractName(contractAccountName, contractName);
      utils.storeContractABI(contractAccountName, contractAbi);
    }
  }

  displayContractFunc = (contractAccountName, solFileName, contractName, contractAbi) => {
    this.state.contractAccountInfo = [{contractAccountName, solFileName, contractName, contractAbi, createDate: new Date().toLocaleString()}, ...this.state.contractAccountInfo];
    this.setState({contractAccountInfo: this.state.contractAccountInfo, txSendVisible: false});
  }

  onDeployContractClose = () => {
    this.setState({deployContractVisible: false});
  }
  delSolFile = () => {
    if (this.state.selectContactFile.length > 0) {
      const index = this.state.solFileList.indexOf(this.state.selectContactFile);
      if (index > -1) {
        this.state.solFileList.splice(index, 1);
        this.setState({solFileList: this.state.solFileList});
        this.delSolTab(this.state.selectContactFile);
        CompilerSrv.delSol(this.state.selectedAccountName, this.state.selectContactFile);
      }
    }
  }
  saveSolFile = () => {
    if (this.state.selectContactFile.length > 0) {
      const index = this.state.solFileList.indexOf(this.state.selectContactFile);
      if (index > -1) {
        const fileName = this.state.selectContactFile;
        const fileContent = global.localStorage.getItem('sol:' + fileName);
        utils.doSave(fileContent, 'text/latex', fileName);
      }
    } else {
      Notification.displayWarningInfo('请先选中需保存到本地的合约文件');
    }
  }
  onCreateAccountOK = async () => {
    if (this.state.firstAccountName == null) {
      Feedback.toast.error('请输入账户名');
      return;
    }

    if (utils.isEmptyObj(this.state.password)) {
      Feedback.toast.error('请输入账号(即钱包)密码');
      return;
    }

    if (!this.state.accountReg.test(this.state.firstAccountName)) {
      Feedback.toast.error(T('账号格式错误'));
      return;
    }

    if (!this.state.passwordReg.test(this.state.password)) {
      Feedback.toast.error(T('密码格式错误'));
      return;
    }

    if (this.state.dupPassword != this.state.password) {
      Feedback.toast.error(T('密码不一致'));
      return;
    }
    try {
      let publicKey = '';
      const allKeys = keystore.getAllKeys();
      if (allKeys.length > 0) {
        publicKey = allKeys[0]['publicKey'];
      } else {
        const ksInfoObj = await keystore.init(this.state.password);
        publicKey = ksInfoObj['publicKey'];
      }
      const chainId = oexchain.oex.getChainId();
      const rpcInfo = Constant.chainId2RPC[chainId];
      const srvRequest = Constant.proxySrvAddr[chainId] + '/wallet_account_creation?accname=' 
                  + this.state.firstAccountName + '&pubkey=' + publicKey + '&deviceid=webWallet' 
                  + '&rpchost=' + rpcInfo.rpcHost + '&rpcport=' + rpcInfo.rpcPort
                  + '&chainid=' + chainId;

      const self = this;
      //Feedback.toast.success('开始创建账号');
      Message.show({
        content: '开始创建账号'
      });
      fetch(srvRequest).then(function(response) {
        return response.json();
      }).then(function(result) {
        console.log(result);
        if (result.code == 200) {
          //Feedback.toast.success('账号正在创建');
          Message.show({
            type: 'loading',
            content: '账号正在创建',
            duration: 10000,
          });
          setTimeout(() => {
            oexchain.oex.getTransactionReceipt(result.msg).then(receipt => {
              if(receipt != null) {
                const status = receipt.actionResults[0].status;
                if (status == 1) {
                  oexchain.account.getAccountByName(self.state.firstAccountName).then(account => {
                    if (account != null) {
                      Message.show({
                        content: '账号创建成功'
                      });

                      self.setState({ createAccountVisible: false });
                      utils.storeDataToFile(Constant.AccountFile, [self.state.firstAccountName]);
                    } else {
                      Message.show({
                        type: 'warning',
                        content: '账号创建尚未被确认，请稍后手动查询下结果（10s内）'
                      });
                    }
                  });
                } else {
                  const error = receipt.actionResults[0].error;
                  Message.show({
                    type: 'error',
                    content: '账号创建失败:' + error
                  });
                }
              } else {
                copy(result.msg);
                Message.show({
                  type: 'warning',
                  content: '结果尚未被确认，交易hash已复制到粘贴板，稍后请自行确认'
                });
              }
            });
          }, 6000);
        } else {
          Message.show({
            type: 'error',
            content: '账号创建失败:' + result.msg
          });
        }
      });
    } catch (error) {
      Feedback.toast.error(error.message);      
    }
  }
  
  onCreateAccountClose = () => {
    this.setState({createAccountVisible: false});
  }

  handleNewAccountNameChange = (v) => {
    this.state.firstAccountName = v;
  }

  handleDupPasswordChange = (v) => {
    this.state.dupPassword = v;
  }

  render() {
    global.localStorage.setItem("solFileList", this.state.solFileList);
    const self = this;
    const addContractBtn = <Button style={styles.icon} text iconSize='xs' onClick={this.addSolFile.bind(this)}> <Icon size='small' type="add"/> </Button>
    const delContractBtn = <Button style={styles.icon} text iconSize='xs' onClick={this.delSolFile.bind(this)}> <Icon size='small' type="ashbin"/> </Button>
    const saveContractBtn = <Button style={styles.icon} text iconSize='xs' onClick={this.saveSolFile.bind(this)}> <Icon size='small' type="download"/> </Button>
    const compileContractBtn = <Button style={styles.icon} text iconSize='xs' onClick={this.compileContract.bind(this)}> <Icon size='small' type="refresh"/> </Button>
    const deployContractBtn = <Button style={styles.icon} text iconSize='xs' onClick={this.deployContract.bind(this)}> <Icon size='small' type="calendar"/> </Button>

    return (
      <Row sytle={styles.all}>
        {/* <Container style={styles.banner}/> */}
        {/* <Container style={{ display: 'flex', width: '100%', height: '100%' }}> */}
          {/* <Shell className={styles.iframeHack} device='desktop' type='dark' style={{border: '1px solid #eee'}}>
            <Shell.LocalNavigation collapse={this.state.collapse} style={{backgroundColor: '#373738', width: this.state.width}} 
                                   onCollapseChange={()=> this.setState({collapse: !this.state.collapse, width: this.state.width != 0 ? 0 : 250})}> */}
            <Col span={4} style={{backgroundColor: '#373738'}}>
              <Row justify='end'>
                <Balloon trigger={addContractBtn} closable={false}>
                    {T('添加合约')}
                </Balloon>
                <Balloon trigger={delContractBtn} closable={false}>
                    {T('删除选中合约')}
                </Balloon>
                <Balloon trigger={saveContractBtn} closable={false}>
                    {T('下载合约')}
                </Balloon>
                <Balloon trigger={compileContractBtn} closable={false}>
                    {T('编译合约')}
                </Balloon>
                <Balloon trigger={deployContractBtn} closable={false}>
                    {T('部署合约')}
                </Balloon>
              </Row>
              <Tree editable showLine draggable selectable
                  style={{ marginTop: '-25px', marginLeft: '12px' }}
                  defaultExpandedKeys={['0', '1', '2']}
                  onEditFinish={this.onEditFinish.bind(this)}
                  onRightClick={this.onRightClick}
                  onSelect={this.onSelectSolFile}>
                   <TreeNode key="0" label={<font color='white'>{T('合约')}</font>} selectable={false}>
                    {
                      this.state.solFileList.map(solFile => {
                        if (this.state.fileContractMap[solFile] != null) {
                          const compiledInfo = this.state.fileContractMap[solFile];
                          const solInfoList = [];
                          for (var contractName in compiledInfo) {
                            const key = solFile + ':' + contractName;
                            var deployedContract = null;
                            if (this.state.contractAccountMap[key] != null) {
                              deployedContract = <TreeNode key={this.state.contractAccountMap[key] + '.ui'} label={<font color='white'>{this.state.contractAccountMap[key] + '.ui'}</font>}/>
                            }
                            const contractNode = <TreeNode key={key} label={<font color='white'>{contractName}</font>}>
                              <TreeNode key={solFile + ':' + contractName + '.abi'} label={<font color='white'>{contractName + '.abi'}</font>}/>
                              <TreeNode key={solFile + ':' + contractName + '.bin'} label={<font color='white'>{contractName + '.bin'}</font>}/>
                              {deployedContract}
                            </TreeNode>
                            solInfoList.push(contractNode);
                          }
                          return <TreeNode key={solFile} label={<font color='white'>{solFile}</font>}>
                                  {[...solInfoList]}
                                </TreeNode>;
                        } else {
                          return <TreeNode key={solFile} label={<font color='white'>{solFile}</font>}/>;
                        }
                      })
                    }
                  </TreeNode>
                  
                  <TreeNode key="1" label={<font color='white'>{T('示例(仅供参考)')}</font>} selectable={false}>
                    {
                      this.state.smapleFileList.map(solFile => <TreeNode key={solFile} label={<font color='white'>{solFile}</font>}/>)
                    }
                  </TreeNode>
              </Tree>
              &nbsp;&nbsp;
              <a href='https://github.com/oexplatform/oexchain/wiki' target="_blank" rel="noopener noreferrer">{T('开发者Wiki')}</a>
              </Col>
            {/* </Shell.LocalNavigation>  } tabRender={(key, props) => <CustomTabItem key={key} {...props} />} 
            <Shell.Content > */}
            <Col span={20}>
              <Row style={{marginTop: 0}}> 
                <Tab shape='capsule' navStyle={{ background: '#373738' }} activeKey={this.state.activeKey} excessMode="slide" onClose={this.onClose.bind(this)} onClick={this.selectTab}>
                  {
                    this.state.tabFileList.map(fileName => {
                      if (fileName.endsWith('.ui')) {
                        const accountName = fileName.substr(0, fileName.length - '.ui'.length);
                        const contractInfo = this.state.accountContractInfoMap[accountName];
                        return (<Tab.Item closeable={true} key={fileName} title={fileName} style={styles.tabStyle} closeFunc={this.onClose}>
                                  <ContractArea self={this} contract={contractInfo}/>
                              </Tab.Item>);
                      } else {
                        var constantContent = null;
                        var fileType = 'sol';
                        if (fileName.endsWith('.abi') || fileName.endsWith('.bin')) {
                          const contractInfo = fileName.split(':');      
                          const contractName = contractInfo[1].split('.')[0];
                          const contractCode = this.state.fileContractMap[contractInfo[0]][contractName];
                          if (contractCode != null) {
                            constantContent = fileName.endsWith('.abi') ? contractCode.abi : contractCode.bin;
                            fileType = fileName.endsWith('.abi') ? 'abi' : 'bin';
                          }
                        }
                        return (<Tab.Item closeable={true} key={fileName} title={fileName} style={styles.tabStyle} closeFunc={this.onClose}>
                                  <ContractEditor height={window.innerHeight - 200} fileType={fileType} fileName={fileName} constantContent={constantContent} accountName={this.state.selectedAccountName}/>                                
                                </Tab.Item>);
                      }
                    }
                            
                    )
                  }
                </Tab>
              </Row>
              <Row style={{ height: 200, backgroundColor: '#373738' }}>
                <Input.TextArea hasClear
                  rows={20}
                  value={this.state.resultInfo}
                  size="medium"
                  onChange={this.changeLog.bind(this)}
                />
              </Row>
            </Col>
            {/* </Shell.Content>
          </Shell> */}
        
        <Dialog language={T('zh-cn')} style={{width: '400px'}}
          visible={this.state.constructorVisible}
          title={T("构造函数")}
          closeable="true"
          footerAlign="center"
          onOk={this.onConstructOK.bind(this)}
          onCancel={() => this.setState({constructorVisible: false})}
          onClose={() => this.setState({constructorVisible: false})}
        >
          <Parameters self={this} width='250' contractName={this.state.curContractName} funcName='constructor' 
                    parameterNames={this.state.constructorParaNames} parameterTypes={this.state.constructorParaTypes} />
        </Dialog>
        <Dialog language={T('zh-cn')} style={{width: '400px'}}
          visible={this.state.addNewContractFileVisible}
          title={T("请输入合约文件名称")}
          closeable="true"
          footerAlign="center"
          onOk={this.onAddNewContractFileOK.bind(this)}
          onCancel={this.onAddNewContractFileClose.bind(this)}
          onClose={this.onAddNewContractFileClose.bind(this)}
        >
          <Input hasClear autoFocus
            onChange={this.handleContractNameChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("合约文件名")}
            size="medium"
            onPressEnter={this.onAddNewContractFileOK.bind(this)}
          />
        </Dialog>
        <Dialog closeable='close,esc,mask' language={T('zh-cn')} style={{width: '400px'}}
          visible={this.state.contractInfoVisible}
          title={T("本地添加合约ABI信息")}
          footerAlign="center"
          onOk={this.onAddContractABIOK.bind(this)}
          onCancel={this.onAddContractABIClose.bind(this)}
          onClose={this.onAddContractABIClose.bind(this)}
        >
          <Input hasClear multiple
            onChange={this.handleContractABIChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("ABI信息")}
            size="medium"
            defaultValue={this.state.originalABI}
            hasLimitHint
          />
        </Dialog>
        
        <Dialog closeable='close,esc,mask' language={T('zh-cn')} style={{width: '400px'}}
          visible={this.state.displayAbiVisible}
          title={T("合约ABI信息")}
          footerAlign="center"
          onOk={this.onDisplayABIOK.bind(this)}
          onCancel={this.onDisplayABIClose.bind(this)}
          onClose={this.onDisplayABIClose.bind(this)}
          okProps={{children: T('复制ABI')}}
        >
          <ReactJson src={this.state.curAbi} displayDataTypes={false} style={{backgroundColor: '#fff'}}/>
        </Dialog>

        <Dialog closeable='close,esc,mask' language={T('zh-cn')} style={{width: '400px'}}
          style={{ width: '500px' }}
          visible={this.state.displayBinVisible}
          title={T("合约BIN信息")}
          footerAlign="center"
          onOk={this.onDisplayBINOK.bind(this)}
          onCancel={this.onDisplayBINClose.bind(this)}
          onClose={this.onDisplayBINClose.bind(this)}
          okProps={{children: T('复制BIN')}}
        >
          <IceEllipsis lineNumber={10} text= {this.state.curBin} />
        </Dialog>

        <Dialog closeable='close,esc,mask' language={T('zh-cn')} style={{width: '400px'}}
          visible={this.state.deployContractVisible}
          title={T("部署合约")}
          closeable="true"
          footerAlign="center"
          onOk={this.onDeployContractOK.bind(this)}
          onCancel={this.onDeployContractClose.bind(this)}
          onClose={this.onDeployContractClose.bind(this)}
        >
          <Input hasClear
            onChange={this.handleContractAccountNameChange.bind(this)}
            value={this.state.newContractAccountName}
            style={styles.inputBoder}
            innerBefore={T("合约账户名")}
            size="medium"
          />
          {/* &nbsp;
          <Checkbox checked
            onChange={
              async (checked) => {                  
                  if (checked) {
                    const accountName = await this.generateContractAccount();
                    this.setState({newContractAccountName : accountName});
                  }
              }
          }>
            {T("自动生成")}
          </Checkbox> */}
          <br/>
          <br/>
          <Input hasClear
            onChange={this.handleContractPublicKeyChange.bind(this)}
            value={this.state.newContractPublicKey}
            style={styles.inputBoder}
            innerBefore={T("公钥")}
            size="medium"
          />
          {/* &nbsp;
          <Checkbox checked
            onChange={
              (checked) => {                  
                  if (checked) {
                    const publicKey = this.getAccountPublicKey();
                    this.setState({newContractPublicKey : publicKey});
                  }
              }
          }>
            {T("同发起账户公钥")}
          </Checkbox> */}
          <br/>
          <br/>
          <Input hasClear
            onChange={this.handleFTAmountChange.bind(this)}
            defaultValue={this.state.ftAmount}
            style={styles.inputBoder}
            innerBefore={T("转账金额")}
            innerAfter='OEX'
            size="medium"
          />
          <br/>
          <br/>
          <Input hasClear
            onChange={this.handleGasPriceChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("GAS单价")}
            innerAfter="Gaoex"
            size="medium"
            defaultValue={this.state.gasPrice}
            hasLimitHint
          />
          <br />
          1Gaoex = 10<sup>-9</sup>oex = 10<sup>9</sup>aoex
          <br />
          <br />
          <Input hasClear hasLimitHint
            onChange={this.handleGasLimitChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("GAS数量上限")}
            size="medium"
            defaultValue={this.state.gasLimit}
          />
          <br />
          <br />
          <Input hasClear
            htmlType="password"
            onChange={this.handlePasswordChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("钱包密码")}
            size="medium"
            defaultValue=""
            maxLength={20}
            hasLimitHint
            onPressEnter={this.onDeployContractOK.bind(this)}
          />
        </Dialog>
        <Dialog language={T('zh-cn')} style={{width: '400px'}}
          visible={this.state.createAccountVisible}
          onOk={this.onCreateAccountOK.bind(this)}
          onCancel={this.onCreateAccountClose.bind(this)}
          onClose={this.onCreateAccountClose.bind(this)}
          title={T("创建账户")}
          footerAlign="center"
        >
          <Input hasClear autoFocus
            onChange={this.handleNewAccountNameChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("账号")}
            size="medium"
            defaultValue=""
            maxLength={16}
            hasLimitHint
            placeholder={T("字母开头,由a-z0-9组成,12~16位")}
          />
          <br />
          <br />
          <Input hasClear 
            htmlType="password"
            onChange={this.handlePasswordChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("密码")}
            placeholder={T("由数字和字母组成,不少于8位,丢失后无法找回")}
            size="medium"
            maxLength={132}
            hasLimitHint
          />
          <br />
          <br />
          <Input hasClear
            htmlType="password"
            onChange={this.handleDupPasswordChange.bind(this)}
            style={styles.inputBoder}
            innerBefore={T("重复密码")}
            size="medium"
            maxLength={132}
            hasLimitHint
            onPressEnter={this.onCreateAccountOK.bind(this)}
          />
        </Dialog>
        <TxSend visible={this.state.txSendVisible} txInfo={this.state.txInfo} accountName={this.state.selectedAccountName} sendResult={this.getTxResult.bind(this)}/>
      </Row>
    );
  }
}

const styles = {
  all: {
    height: 'auto',
    background: '#f5f6fa',
    display: 'flex',
    justifyContent: 'start',
    flexDirection: 'column',
    alignItems: 'center'
  },
  banner: {
    width: '100%', 
    height: '310px', 
    paddingBottom: '-30px',
    backgroundColor: '#080a20',
    display: 'flex',
    justifyContent: 'start',
    flexDirection: 'column',
    alignItems: 'center'
  },
  btn: {
    borderRadius: '2px',
    backgroundColor: '#5c67f2'
  },
  selectAndBtn: {
    display: 'flex',
    justifyContent: 'start',
    alignItems: 'center'
  },
  inputBoder: {
    borderBottom: '1px solid #dbdbdb',
    borderTop: '0px',
    borderLeft: '0px',
    borderRight: '0px',
  },
  selectBoder: {
    borderBottom: '1px solid #dbdbdb',
    borderTop: '0px',
    borderLeft: '0px',
    borderRight: '0px',
  },
  dialogBtn: {
    width: '100%',
    height: '60px',
    borderRadius: '2px',
    backgroundColor: '#5c67f2'
  },
  tabStyle: {
    height:'30px',
    textAlign: 'center',
    borderRadius: 0,
    border: '0px solid #282828',
    marginRight: 2,
    paddingTop: '7px'
  },
  rowStyle: {
    height:'25px',
    backgroundColor: '#373738'
  },
  iframeHack: {
    width: '100%',
    height: '100%'
  },
  icon: {
    marginRight: '8px'
  }
}