// 以下文件格式为描述路由的协议格式
// 你可以调整 routerConfig 里的内容
// 变量名 routerConfig 为 iceworks 检测关键字，请不要修改名称

import { getRouterData } from './utils/utils';
import { asideMenuConfig } from './menuConfig';

import BasicLayout from './layouts/BasicLayout';
import AccountManager from './pages/AccountManager';
import KeystoreManager from './pages/KeystoreManager';
import ContractDev from './pages/ContractDev';


const routerConfig = [
  {
    path: '/AccountManager',
    layout: BasicLayout,
    component: AccountManager,
  },
  {
    path: '/KeystoreManager',
    layout: BasicLayout,
    component: KeystoreManager,
  },
  {
    path: '/contractDev',
    layout: BasicLayout,
    component: ContractDev,
  }
];

const routerData = getRouterData(routerConfig, asideMenuConfig);

export { routerData };
