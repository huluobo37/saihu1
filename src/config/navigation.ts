export interface NavNode { key: string; labelKey: string; icon?: string; children?: NavNode[]; hidden?: boolean; keywordKeys?: string[] }
export const NAVIGATION: NavNode[] = [
  { key: '/overview', labelKey: '数据总览', icon: 'dashboard' }, { key: '/campaigns', labelKey: '广告活动分析', icon: 'chart' },
  { key: '/search-terms', labelKey: '搜索词分析', icon: 'search' }, { key: '/trends', labelKey: '趋势分析', icon: 'trend' }, { key: '/placements', labelKey: '广告位分析', icon: 'placement' },
  { key: '/import', labelKey: '数据导入', icon: 'import' }, { key: '/management', labelKey: '数据管理', icon: 'database' },
  { key: '/sync', labelKey: '本地与云端同步', icon: 'cloud' }, { key: '/settings', labelKey: '系统设置', icon: 'settings' },
];
export function navLeaves(nodes: NavNode[] = NAVIGATION): NavNode[] { return nodes.flatMap((node) => node.children ? navLeaves(node.children) : [node]); }
export function matchNav(pathname: string): NavNode[] { const match = NAVIGATION.find((node) => pathname === node.key || pathname.startsWith(`${node.key}/`)); return match ? [match] : []; }
export function activeNavKey(pathname: string): string | undefined { return matchNav(pathname)[0]?.key; }
