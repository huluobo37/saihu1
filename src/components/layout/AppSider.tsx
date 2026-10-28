import { BarChartOutlined, CloudOutlined, DashboardOutlined, DatabaseOutlined, FundProjectionScreenOutlined, LineChartOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { NAVIGATION, activeNavKey } from '@/config/navigation';
import { usePreferences } from '@/stores/preferences';
const { Sider } = Layout;
const ICONS: Record<string, ReactNode> = { dashboard: <DashboardOutlined />, chart: <BarChartOutlined />, trend: <LineChartOutlined />, placement: <FundProjectionScreenOutlined />, import: <UploadOutlined />, database: <DatabaseOutlined />, cloud: <CloudOutlined />, settings: <SettingOutlined /> };
export function AppSider() {
  const navigate = useNavigate(); const location = useLocation(); const collapsed = usePreferences((s) => s.siderCollapsed); const setSiderCollapsed = usePreferences((s) => s.setSiderCollapsed);
  useEffect(() => {
    if (window.matchMedia('(max-width: 640px)').matches) setSiderCollapsed(true);
  }, [setSiderCollapsed]);
  const items = useMemo<MenuProps['items']>(() => NAVIGATION.map((node) => ({ key: node.key, icon: node.icon ? ICONS[node.icon] : undefined, label: node.labelKey })), []);
  const selected = activeNavKey(location.pathname);
  return <Sider className="app-sider" width="var(--layout-sider-w)" collapsedWidth="var(--layout-sider-collapsed-w)" collapsed={collapsed} theme="light" style={{ borderInlineEnd: '1px solid var(--c-border)', position: 'sticky', top: 0, height: '100dvh', overflow: 'auto' }}>
    <div style={{ height: 'var(--layout-header-h)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-4)', borderBottom: '1px solid var(--c-border-soft)' }}><span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--ant-color-primary)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>A</span>{!collapsed && <strong style={{ fontSize: 14 }}>Amazon Ads Analytics</strong>}</div>
    <Menu mode="inline" selectedKeys={selected ? [selected] : []} items={items} style={{ borderInlineEnd: 0, paddingBlock: 'var(--space-2)' }} onClick={({ key }) => { void navigate(key); if (window.matchMedia('(max-width: 640px)').matches) setSiderCollapsed(true); }} />
  </Sider>;
}
