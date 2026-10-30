import {
  ArrowLeftOutlined, CloudOutlined, DeleteOutlined, DownloadOutlined,
  InboxOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined, SyncOutlined, UploadOutlined,
} from '@ant-design/icons';
import {
  Alert, App, AutoComplete, Button, Card, Checkbox, Col, DatePicker, Descriptions, Divider, Empty, Flex, Form, Input,
  Modal, Result, Row, Select, Space, Statistic, Switch, Table, Tag, Typography, Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import * as XLSX from 'xlsx';

import { calculateMetrics, groupRecords } from './metrics';
import { buildTrendData, MOVING_AVERAGE_COLORS, type MovingAverageWindow, type TrendMetric, type TrendPoint } from './chartData';
import { MAPPING_TARGET_OPTIONS, parseExcel, remapPreview, type MappingTarget } from './excel';
import type { AdsRecord, Metrics, ReportType } from './types';
import { useAds } from './AdsContext';
import { getSetting, replaceAll, setSetting } from './db';
import { getCurrentSession, isSupabaseConfigured, signIn, signOut, signUp, subscribeToAuth, syncWithSupabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

const { Title, Text, Paragraph } = Typography;
const money = (value: number | null) => value === null ? '—' : value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = (value: number | null) => value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const multiple = (value: number | null) => value === null ? '—' : value.toFixed(2);
const reportTypeLabel = (value: ReportType) => ({ campaign: '广告活动日报', adGroup: '广告组日报', searchTerm: '搜索词日报', placement: '广告位日报', unknown: '待确认' })[value];
const PAGE_SIZE_OPTIONS = [10, 15, 20, 50, 100];
const tablePagination = (defaultPageSize = 15) => ({
  defaultPageSize,
  showSizeChanger: true,
  pageSizeOptions: PAGE_SIZE_OPTIONS,
  showTotal: (total: number, range: [number, number]) => `第 ${range[0]}–${range[1]} 条，共 ${total} 条`,
});

function PageTitle({ title, subtitle, extra }: { title: string; subtitle: string; extra?: ReactNode }) {
  return <Flex justify="space-between" align="flex-start" gap={16} wrap><div><Title level={2} style={{ marginBottom: 4 }}>{title}</Title><Text type="secondary">{subtitle}</Text></div>{extra}</Flex>;
}

function NoData() {
  const navigate = useNavigate();
  return <Card style={{ marginTop: 24 }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Space orientation="vertical"><Text strong>尚未导入广告数据</Text><Text type="secondary">请选择赛虎 ERP 导出的 .xlsx 广告报表。系统不会填充示例业务数据。</Text></Space>}><Button type="primary" icon={<UploadOutlined />} onClick={() => void navigate('/import')}>导入 Excel</Button></Empty></Card>;
}

function DataScope({ reportTypes = ['campaign'] }: { reportTypes?: ReportType[] }) {
  const { records, filtered, filters, setFilters } = useAds();
  const scopedRecords = records.filter((record) => reportTypes.includes(record.reportType));
  const scopedFiltered = filtered.filter((record) => reportTypes.includes(record.reportType));
  const unique = (field: 'product' | 'store' | 'campaign' | 'adType' | 'status') => [...new Set(scopedRecords.map((r) => field === 'product' ? (r.product ?? '未分类产品') : r[field]).filter((v): v is string => Boolean(v)))].sort();
  const dates = [...new Set(scopedRecords.map((record) => record.date).filter((value): value is string => Boolean(value)))].sort();
  const maxDate = dates.length ? dayjs(dates.at(-1)) : null;
  const presets = maxDate ? [
    { label: '最近 7 日', value: [maxDate.subtract(6, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 10 日', value: [maxDate.subtract(9, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 30 日', value: [maxDate.subtract(29, 'day'), maxDate] as [Dayjs, Dayjs] },
    ...(dates.length ? [{ label: '全部日期', value: [dayjs(dates[0]), maxDate] as [Dayjs, Dayjs] }] : []),
  ] : [];
  return <Card size="small" style={{ marginTop: 20 }}><Flex gap={10} wrap align="center">
    <Text strong>所有折线图日期范围</Text>
    <DatePicker.RangePicker presets={presets} value={filters.dateRange ? [dayjs(filters.dateRange[0]), dayjs(filters.dateRange[1])] : null} onChange={(values) => setFilters({ ...filters, dateRange: values ? [values[0]!.format('YYYY-MM-DD'), values[1]!.format('YYYY-MM-DD')] : null })} />
    {(['product', 'store', 'campaign', 'adType', 'status'] as const).map((field) => <Select key={field} allowClear showSearch style={{ minWidth: field === 'campaign' ? 220 : field === 'product' ? 180 : 140 }} placeholder={{ product: '全部产品', store: '全部店铺', campaign: '全部广告活动', adType: '全部广告类型', status: '全部状态' }[field]} value={filters[field]} options={unique(field).map((value) => ({ value, label: value }))} onChange={(value) => setFilters({ ...filters, [field]: value ?? null })} />)}
    <Tag color="blue">{scopedFiltered.length} / {scopedRecords.length} 条</Tag>
  </Flex></Card>;
}

function MetricCards({ metrics }: { metrics: Metrics }) {
  const cards: [string, string, string?][] = [
    ['广告花费', money(metrics.spend)], ['广告销售额', money(metrics.sales)], ['广告订单量', integer(metrics.orders)],
    ['广告曝光量', integer(metrics.impressions)], ['广告点击量', integer(metrics.clicks)], ['ACOS', percent(metrics.acos)],
    ['CPC', money(metrics.cpc)], ['CTR', percent(metrics.ctr)], ['转化率', percent(metrics.conversionRate)], ['ROAS', multiple(metrics.roas), 'x'],
  ];
  return <Row gutter={[16, 16]} style={{ marginTop: 16 }}>{cards.map(([title, value, suffix]) => <Col xs={24} sm={12} md={8} xl={6} xxl={4} key={title}><Card><Statistic title={title} value={value} suffix={suffix} /></Card></Col>)}</Row>;
}

function ChartCard({ title, children, height = 340, extra }: { title: string; children: ReactNode; height?: number; extra?: ReactNode }) {
  return <Card title={title} extra={extra} styles={{ body: { height } }}>{children}</Card>;
}

function CampaignCharts({ rows }: { rows: AdsRecord[] }) {
  const navigate = useNavigate();
  const metricOptions = [
    { value: 'spend', label: '广告花费', color: '#0072B2', formatter: money },
    { value: 'sales', label: '广告销售额', color: '#009E73', formatter: money },
    { value: 'orders', label: '广告订单量', color: '#56B4E9', formatter: integer },
    { value: 'acos', label: 'ACOS', color: '#D55E00', formatter: percent },
    { value: 'cpc', label: 'CPC', color: '#CC79A7', formatter: money },
    { value: 'ctr', label: 'CTR', color: '#E69F00', formatter: percent },
    { value: 'conversionRate', label: '转化率', color: '#6A5ACD', formatter: percent },
    { value: 'roas', label: 'ROAS', color: '#4D7C0F', formatter: multiple },
  ] as const;
  const [metric, setMetric] = useState<(typeof metricOptions)[number]['value']>('spend');
  const config = metricOptions.find((option) => option.value === metric)!;
  const data = groupRecords(rows, (r) => `${r.product ?? '未分类产品'} · ${r.campaign ?? '未命名活动'}`).sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1)).map((item, index) => ({ ...item, rank: index + 1, product: item.records[0]?.product ?? '未分类产品', campaign: item.records[0]?.campaign ?? '未命名活动' }));
  if (!data.length) return null;
  const chartHeight = Math.max(460, data.length * 42 + 86);
  return <Card style={{ marginTop: 16, overflow: 'hidden' }} title={<Space orientation="vertical" size={0}><Text strong style={{ fontSize: 16 }}>广告活动表现排行</Text><Text type="secondary" style={{ fontSize: 12 }}>按所选指标从高到低排列，点击名称查看每日明细</Text></Space>} extra={<Space wrap><Tag color="blue">{data.length} 个活动</Tag><Select aria-label="选择广告活动对比指标" value={metric} style={{ width: 160 }} options={metricOptions.map(({ value, label }) => ({ value, label }))} onChange={setMetric} /></Space>}>
    <div style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" barCategoryGap="28%" margin={{ top: 10, right: 118, left: 22, bottom: 16 }}>
      <defs><linearGradient id={`campaign-bar-${metric}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={config.color} stopOpacity={0.7} /><stop offset="100%" stopColor={config.color} stopOpacity={1} /></linearGradient></defs>
      <CartesianGrid strokeDasharray="3 6" horizontal={false} stroke="#94A3B8" strokeOpacity={0.28} />
      <XAxis type="number" axisLine={false} tickLine={false} tickMargin={10} tickFormatter={(value) => config.formatter(Number(value))} />
      <YAxis type="category" dataKey="name" width={300} interval={0} axisLine={false} tickLine={false} tick={(props) => {
      const name = String(props.payload.value);
      const label = name.length > 34 ? `${name.slice(0, 33)}…` : name;
      const rank = data.find((item) => item.name === name)?.rank ?? 0;
      const row = data.find((item) => item.name === name);
      return <g transform={`translate(${props.x},${props.y})`} style={{ cursor: 'pointer' }} onClick={() => row && void navigate(`/campaign-detail?campaign=${encodeURIComponent(row.campaign)}&product=${encodeURIComponent(row.product)}`)}><title>{`查看 ${name}`}</title><text x={-10} y={0} dy={4} textAnchor="end" fontSize={12}><tspan fill="#F59E0B" fontWeight={700}>{String(rank).padStart(2, '0')}</tspan><tspan fill="#3B82F6">　{label}　›</tspan></text></g>;
    }} />
      <Tooltip cursor={{ fill: '#94A3B8', fillOpacity: 0.08 }} contentStyle={{ borderRadius: 10, border: '1px solid rgba(148, 163, 184, 0.35)', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)' }} labelFormatter={(label) => `${String(label)}（点击名称查看详情）`} formatter={(value) => typeof value === 'number' ? config.formatter(value) : value} />
      <Bar dataKey={metric} name={config.label} fill={`url(#campaign-bar-${metric})`} radius={[0, 7, 7, 0]} maxBarSize={24} background={{ fill: '#94A3B8', fillOpacity: 0.08, radius: 7 }}><LabelList dataKey={metric} position="right" offset={10} formatter={(value: unknown) => typeof value === 'number' ? config.formatter(value) : ''} style={{ fontSize: 12, fontWeight: 600 }} /></Bar>
    </BarChart></ResponsiveContainer></div>
  </Card>;
}

interface ProductCampaignSummaryRow extends Metrics {
  key: string;
  kind: 'product' | 'campaign';
  product: string;
  campaign: string | null;
  campaignCount: number;
  children?: ProductCampaignSummaryRow[];
}

function ProductCampaignClassification({ rows }: { rows: AdsRecord[] }) {
  const { filters, setFilters } = useAds();
  const data = groupRecords(rows, (row) => row.product ?? '未分类产品')
    .sort((a, b) => b.spend - a.spend)
    .map((product): ProductCampaignSummaryRow => {
      const campaigns = groupRecords(product.records, (row) => row.campaign ?? '未命名活动')
        .sort((a, b) => b.spend - a.spend)
        .map((campaign): ProductCampaignSummaryRow => ({
          key: `${product.name}::${campaign.name}`,
          kind: 'campaign',
          product: product.name,
          campaign: campaign.name,
          campaignCount: 1,
          ...calculateMetrics(campaign.records),
        }));
      return {
        key: `product::${product.name}`,
        kind: 'product',
        product: product.name,
        campaign: null,
        campaignCount: campaigns.length,
        ...calculateMetrics(product.records),
        children: campaigns,
      };
    });
  if (!data.length) return null;
  const columns: ColumnsType<ProductCampaignSummaryRow> = [
    {
      title: '产品 / 广告活动', key: 'name', width: 360,
      render: (_, row) => row.kind === 'product'
        ? <Button type={filters.product === row.product ? 'primary' : 'text'} onClick={() => setFilters({ ...filters, product: filters.product === row.product ? null : row.product })}><Text strong style={{ color: 'inherit' }}>{row.product}</Text></Button>
        : <Link to={`/campaign-detail?campaign=${encodeURIComponent(row.campaign ?? '未命名活动')}&product=${encodeURIComponent(row.product)}`}>{row.campaign}</Link>,
    },
    { title: '活动数', dataIndex: 'campaignCount', width: 90, align: 'right', render: (value, row) => row.kind === 'product' ? <Tag color="blue">{value} 个</Tag> : '—' },
    { title: '花费', dataIndex: 'spend', width: 120, align: 'right', render: money },
    { title: '销售额', dataIndex: 'sales', width: 120, align: 'right', render: money },
    { title: '订单', dataIndex: 'orders', width: 90, align: 'right', render: integer },
    { title: 'ACOS', dataIndex: 'acos', width: 100, align: 'right', render: percent },
    { title: 'ROAS', dataIndex: 'roas', width: 90, align: 'right', render: multiple },
  ];
  return <Card style={{ marginTop: 16 }} title={<Space orientation="vertical" size={0}><Text strong style={{ fontSize: 16 }}>按产品分类广告活动</Text><Text type="secondary" style={{ fontSize: 12 }}>展开产品查看活动，点击产品名称筛选整个总览</Text></Space>} extra={<Space><Tag color="purple">{data.length} 个产品</Tag>{filters.product && <Button size="small" onClick={() => setFilters({ ...filters, product: null })}>查看全部产品</Button>}</Space>}>
    <Table<ProductCampaignSummaryRow> size="small" rowKey="key" columns={columns} dataSource={data} pagination={false} expandable={{ defaultExpandAllRows: true, indentSize: 24 }} scroll={{ x: 970 }} />
  </Card>;
}

export function OverviewPage() {
  const { records, filtered, filters } = useAds();
  const campaignRecords = records.filter((row) => row.reportType === 'campaign');
  const campaignRows = filtered.filter((row) => row.reportType === 'campaign');
  const classificationRows = campaignRecords.filter((row) => {
    if (filters.dateRange && (!row.date || row.date < filters.dateRange[0] || row.date > filters.dateRange[1])) return false;
    return (!filters.store || row.store === filters.store) && (!filters.campaign || row.campaign === filters.campaign)
      && (!filters.adType || row.adType === filters.adType) && (!filters.status || row.status === filters.status);
  });
  const dates = [...new Set(campaignRows.map((r) => r.date).filter(Boolean))].sort();
  return <><PageTitle title="数据总览" subtitle="总览只汇总广告活动日报，避免与搜索词和广告位报表重复计算" extra={campaignRecords.length ? <Tag color="processing">活动日报口径</Tag> : undefined} /><DataScope />{!campaignRecords.length ? <NoData /> : <><Alert style={{ marginTop: 16 }} type={dates.length === 1 ? 'info' : 'success'} showIcon title={dates.length === 1 ? `当前数据日期：${dates[0]}。这是单日数据，不代表长期平均水平。` : `当前包含 ${dates.length} 个日期：${dates[0]} 至 ${dates.at(-1)}`} /><ProductCampaignClassification rows={classificationRows} /><MetricCards metrics={calculateMetrics(campaignRows)} /><CampaignCharts rows={campaignRows} /></>}</>;
}

const recordColumns: ColumnsType<AdsRecord> = [
  { title: '日期', dataIndex: 'date', fixed: 'left', width: 110, sorter: (a, b) => (a.date ?? '').localeCompare(b.date ?? '') },
  { title: '产品', dataIndex: 'product', width: 130, render: (value: string | null) => value ?? '未分类产品' },
  { title: '店铺', dataIndex: 'store', width: 100 }, { title: '广告活动', dataIndex: 'campaign', fixed: 'left', width: 240, ellipsis: true, render: (value: string | null, row) => value ? <Link to={`/campaign-detail?campaign=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product ?? '未分类产品')}`}>{value}</Link> : '—' },
  { title: '花费', dataIndex: 'spend', width: 105, align: 'right', render: money, sorter: (a, b) => (a.spend ?? -1) - (b.spend ?? -1) },
  { title: '销售额', dataIndex: 'sales', width: 105, align: 'right', render: money, sorter: (a, b) => (a.sales ?? -1) - (b.sales ?? -1) },
  { title: '订单', dataIndex: 'orders', width: 80, align: 'right', render: integer, sorter: (a, b) => (a.orders ?? -1) - (b.orders ?? -1) }, { title: '曝光', dataIndex: 'impressions', width: 100, align: 'right', render: integer, sorter: (a, b) => (a.impressions ?? -1) - (b.impressions ?? -1) }, { title: '点击', dataIndex: 'clicks', width: 80, align: 'right', render: integer, sorter: (a, b) => (a.clicks ?? -1) - (b.clicks ?? -1) },
  { title: 'ACOS', width: 90, render: (_, r) => percent(calculateMetrics([r]).acos), sorter: (a, b) => (calculateMetrics([a]).acos ?? -1) - (calculateMetrics([b]).acos ?? -1) },
  { title: 'CPC', width: 80, render: (_, r) => money(calculateMetrics([r]).cpc), sorter: (a, b) => (calculateMetrics([a]).cpc ?? -1) - (calculateMetrics([b]).cpc ?? -1) }, { title: 'CTR', width: 90, render: (_, r) => percent(calculateMetrics([r]).ctr), sorter: (a, b) => (calculateMetrics([a]).ctr ?? -1) - (calculateMetrics([b]).ctr ?? -1) },
  { title: '转化率', width: 90, render: (_, r) => percent(calculateMetrics([r]).conversionRate), sorter: (a, b) => (calculateMetrics([a]).conversionRate ?? -1) - (calculateMetrics([b]).conversionRate ?? -1) }, { title: 'ROAS', width: 80, render: (_, r) => multiple(calculateMetrics([r]).roas), sorter: (a, b) => (calculateMetrics([a]).roas ?? -1) - (calculateMetrics([b]).roas ?? -1) },
  { title: '每日预算', dataIndex: 'dailyBudget', width: 100, render: money, sorter: (a, b) => (a.dailyBudget ?? -1) - (b.dailyBudget ?? -1) }, { title: '广告类型', dataIndex: 'adType', width: 110 }, { title: '状态', dataIndex: 'status', width: 100 },
];

export function CampaignPage() {
  const { records, filtered } = useAds(); const [search, setSearch] = useState(''); const [raw, setRaw] = useState<AdsRecord | null>(null);
  const campaignRecords = records.filter((row) => row.reportType === 'campaign');
  const rows = filtered.filter((r) => r.reportType === 'campaign' && (!search || (r.campaign ?? '').toLowerCase().includes(search.toLowerCase())));
  const exportRows = () => { const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({ 产品: r.product ?? '未分类产品', 日期: r.date, 店铺名称: r.store, 广告活动: r.campaign, 广告花费: r.spend, 广告销售额: r.sales, 广告订单量: r.orders, 广告曝光量: r.impressions, 广告点击量: r.clicks, ACOS: calculateMetrics([r]).acos, CPC: calculateMetrics([r]).cpc, CTR: calculateMetrics([r]).ctr, 转化率: calculateMetrics([r]).conversionRate, ROAS: calculateMetrics([r]).roas, 每日预算: r.dailyBudget, 广告类型: r.adType, 有效状态: r.status }))); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '广告活动'); XLSX.writeFile(book, '广告活动筛选结果.xlsx'); };
  return <><PageTitle title="广告活动分析" subtitle="广告活动日报与重新计算指标；搜索词和广告位另行关联展示，不重复计入" extra={<Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={exportRows}>导出筛选结果</Button>} /><DataScope />{!campaignRecords.length ? <NoData /> : <Card style={{ marginTop: 16 }}><Input.Search allowClear style={{ maxWidth: 360, marginBottom: 16 }} placeholder="搜索广告活动名称" onSearch={setSearch} onChange={(e) => setSearch(e.target.value)} /><Table rowKey="id" size="small" columns={[...recordColumns, { title: '原始记录', fixed: 'right', width: 100, render: (_, row) => <Button type="link" onClick={() => setRaw(row)}>查看</Button> }]} dataSource={rows} scroll={{ x: 1900 }} pagination={tablePagination(20)} /><Modal width={760} open={Boolean(raw)} onCancel={() => setRaw(null)} footer={null} title="完整原始记录"><Descriptions bordered size="small" column={1} items={Object.entries(raw?.raw ?? {}).map(([label, value]) => ({ key: label, label, children: value === null ? <Text type="secondary">null</Text> : String(value) }))} /></Modal></Card>}</>;
}

function TrendMetricChart({ title, data, metric, formatter, tickFormatter, windows, rawColor }: {
  title: string; data: TrendPoint[]; metric: TrendMetric; formatter: (value: number | null) => string;
  tickFormatter?: (value: number) => string; windows: MovingAverageWindow[]; rawColor: string;
}) {
  const values = data.map((point) => point[metric]).filter((value): value is number => typeof value === 'number');
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const chartWidth = Math.max(760, data.length * 68);
  return <ChartCard title={title} height={420} extra={<Text type="secondary">期间平均：{formatter(average)}</Text>}><div style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden' }}><div style={{ width: chartWidth, height: '100%' }}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 18, right: 28, left: 8, bottom: 8 }}>
    <CartesianGrid strokeDasharray="2 4" vertical={false} />
    <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={76} tickMargin={10} tickFormatter={(value) => dayjs(String(value)).format('MM-DD')} />
    <YAxis tickFormatter={tickFormatter} width={64} />
    <Tooltip labelFormatter={(label) => `日期：${String(label)}`} formatter={(value, name) => [typeof value === 'number' ? formatter(value) : '—', name]} />
    <Legend verticalAlign="top" height={32} />
    {average !== null && <ReferenceLine y={average} name="期间平均" stroke="#7C3AED" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: '期间平均', position: 'insideTopRight', fill: '#7C3AED', fontSize: 12 }} />}
    <Line type="monotone" dataKey={metric} name="每日值" stroke={rawColor} strokeWidth={1.6} dot={{ r: 2.4, strokeWidth: 1 }} activeDot={{ r: 5 }} connectNulls={false} />
    {windows.map((window) => <Line key={window} type="monotone" dataKey={`${metric}Ma${window}`} name={`${window} 日移动平均`} stroke={MOVING_AVERAGE_COLORS[window]} strokeWidth={2.4} dot={false} connectNulls={false} />)}
  </LineChart></ResponsiveContainer></div></div></ChartCard>;
}

const metricCharts: { title: string; metric: TrendMetric; formatter: (value: number | null) => string; tickFormatter?: (value: number) => string; color: string }[] = [
  { title: '每日广告花费', metric: 'spend', formatter: money, color: '#4B5563' },
  { title: '每日广告销售额', metric: 'sales', formatter: money, color: '#4B5563' },
  { title: '每日广告订单量', metric: 'orders', formatter: integer, color: '#4B5563', tickFormatter: (value) => String(Math.round(value)) },
  { title: '每日广告曝光量', metric: 'impressions', formatter: integer, color: '#4B5563', tickFormatter: (value) => integer(value) },
  { title: '每日广告点击量', metric: 'clicks', formatter: integer, color: '#4B5563', tickFormatter: (value) => String(Math.round(value)) },
  { title: '每日 ACOS', metric: 'acos', formatter: percent, color: '#4B5563', tickFormatter: (value) => `${(value * 100).toFixed(0)}%` },
  { title: '每日 CPC', metric: 'cpc', formatter: money, color: '#4B5563' },
  { title: '每日 CTR', metric: 'ctr', formatter: percent, color: '#4B5563', tickFormatter: (value) => `${(value * 100).toFixed(1)}%` },
  { title: '每日转化率', metric: 'conversionRate', formatter: percent, color: '#4B5563', tickFormatter: (value) => `${(value * 100).toFixed(1)}%` },
  { title: '每日 ROAS', metric: 'roas', formatter: multiple, color: '#4B5563' },
];

function MovingAverageControls({ windows, setWindows }: { windows: MovingAverageWindow[]; setWindows: (values: MovingAverageWindow[]) => void }) {
  const options = ([3, 5, 7, 14] as MovingAverageWindow[]).map((value) => ({ label: `${value} 日移动平均`, value }));
  return <Card size="small"><Flex gap={16} align="center" wrap><Text strong>折线显示</Text><Checkbox.Group options={options} value={windows} onChange={(values) => setWindows(values as MovingAverageWindow[])} /><Text type="secondary">灰线为每日数据，紫色虚线为所选期间平均</Text></Flex></Card>;
}

export function CampaignDetailPage() {
  const [searchParams] = useSearchParams();
  const campaignName = searchParams.get('campaign') ?? '';
  const productName = searchParams.get('product');
  const navigate = useNavigate();
  const { records } = useAds();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [windows, setWindows] = useState<MovingAverageWindow[]>([3, 5, 7, 14]);
  useEffect(() => setDateRange(null), [campaignName]);
  const sameCampaign = (record: AdsRecord) => (record.campaign === campaignName || (!record.campaign && campaignName === '未命名活动')) && (!productName || (record.product ?? '未分类产品') === productName);
  const campaignRows = records.filter((record) => record.reportType === 'campaign' && sameCampaign(record));
  const relatedSearchTerms = records.filter((record) => record.reportType === 'searchTerm' && sameCampaign(record));
  const relatedPlacements = records.filter((record) => record.reportType === 'placement' && sameCampaign(record));
  const campaignDates = [...new Set(campaignRows.map((record) => record.date).filter((value): value is string => Boolean(value)))].sort();
  const rows = campaignRows.filter((record) => !dateRange || Boolean(record.date && record.date >= dateRange[0] && record.date <= dateRange[1]));
  const dates = [...new Set(rows.map((record) => record.date).filter((value): value is string => Boolean(value)))].sort();
  const maxDate = campaignDates.length ? dayjs(campaignDates.at(-1)) : null;
  const presets = maxDate ? [
    { label: '最近 7 日', value: [maxDate.subtract(6, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 10 日', value: [maxDate.subtract(9, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 30 日', value: [maxDate.subtract(29, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '全部日期', value: [dayjs(campaignDates[0]), maxDate] as [Dayjs, Dayjs] },
  ] : [];
  if (!campaignRows.length) return <><Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/campaigns')}>返回广告活动</Button><Result status="404" title="未找到该广告活动" subTitle={campaignName} /></>;
  const data = buildTrendData(rows);
  const stores = [...new Set(campaignRows.map((record) => record.store).filter(Boolean))].join('、');
  return <>
    <Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/campaigns')}>返回广告活动</Button>
    <PageTitle title={campaignName || '未命名活动'} subtitle="该广告活动的每日数据、汇总指标，以及自动关联的搜索词和广告位" extra={<Space wrap><Tag color="purple">{productName || campaignRows[0]?.product || '未分类产品'}</Tag><Tag>{stores || '未知店铺'}</Tag><Tag color="blue">{rows.length} 条活动记录</Tag></Space>} />
    <Card size="small" style={{ marginTop: 20 }}><Flex gap={12} align="center" wrap><Text strong>所有折线图日期范围</Text><DatePicker.RangePicker aria-label="选择广告活动日期范围" presets={presets} value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null} onChange={(values) => setDateRange(values ? [values[0]!.format('YYYY-MM-DD'), values[1]!.format('YYYY-MM-DD')] : null)} /><Text type="secondary">{dates.length ? `${dates[0]} 至 ${dates.at(-1)}，逐日显示，共 ${dates.length} 日` : '所选日期无数据'}</Text></Flex></Card>
    {!rows.length ? <Card style={{ marginTop: 16 }}><Empty description="所选日期范围内没有数据" /></Card> : <>
      <MetricCards metrics={calculateMetrics(rows)} />
      <div style={{ marginTop: 16 }}><MovingAverageControls windows={windows} setWindows={setWindows} /></div>
      {dates.length < 14 && windows.includes(14) && <Alert style={{ marginTop: 12 }} type="info" showIcon title={`当前只有 ${dates.length} 个有效日期，14 日移动平均将在第 14 个有效日期后开始显示。`} />}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>{metricCharts.map((chart) => <Col xs={24} xl={12} key={chart.metric}><TrendMetricChart title={chart.title} data={data} metric={chart.metric} formatter={chart.formatter} tickFormatter={chart.tickFormatter} windows={windows} rawColor={chart.color} /></Col>)}</Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}><Card title={`关联搜索词（${relatedSearchTerms.length} 条）`} extra={<Link to={`/search-terms?campaign=${encodeURIComponent(campaignName)}&product=${encodeURIComponent(productName || campaignRows[0]?.product || '')}`}>查看全部</Link>}><Table size="small" rowKey="id" dataSource={relatedSearchTerms.slice(0, 8)} pagination={false} columns={[{ title: '日期', dataIndex: 'date', width: 105 }, { title: '搜索词', dataIndex: 'searchTerm', ellipsis: true, render: (value: string | null, row: AdsRecord) => value ? <Link to={`/search-term-detail?searchTerm=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product ?? '未分类产品')}&campaign=${encodeURIComponent(row.campaign ?? '')}`}>{value}</Link> : '—' }, { title: '广告组', dataIndex: 'adGroup', ellipsis: true }, { title: '花费', dataIndex: 'spend', width: 80, render: money }, { title: '订单', dataIndex: 'orders', width: 65, render: integer }]} locale={{ emptyText: '尚未导入该活动的搜索词报表' }} /></Card></Col>
        <Col xs={24} xl={12}><Card title={`关联广告位（${relatedPlacements.length} 条）`} extra={<Link to={`/placements?campaign=${encodeURIComponent(campaignName)}&product=${encodeURIComponent(productName || campaignRows[0]?.product || '')}`}>查看全部</Link>}><Table size="small" rowKey="id" dataSource={relatedPlacements.slice(0, 8)} pagination={false} columns={[{ title: '日期', dataIndex: 'date', width: 105 }, { title: '广告位', dataIndex: 'placement', ellipsis: true }, { title: '花费', dataIndex: 'spend', width: 80, render: money }, { title: '销售额', dataIndex: 'sales', width: 90, render: money }, { title: '订单', dataIndex: 'orders', width: 65, render: integer }]} locale={{ emptyText: '尚未导入该活动的广告位报表' }} /></Card></Col>
      </Row>
    </>}
  </>;
}

export function TrendsPage() {
  const { records, filtered } = useAds(); const campaignRecords = records.filter((row) => row.reportType === 'campaign'); const rows = filtered.filter((row) => row.reportType === 'campaign'); const dates = [...new Set(rows.map((r) => r.date).filter((v): v is string => Boolean(v)))].sort();
  const data = buildTrendData(rows);
  const [windows, setWindows] = useState<MovingAverageWindow[]>([3, 5, 7, 14]);
  return <><PageTitle title="趋势分析" subtitle="按广告活动日报日期聚合；搜索词和广告位数据不会重复计入" /><DataScope />{!campaignRecords.length ? <NoData /> : dates.length < 2 ? <><Alert style={{ marginTop: 16 }} type="warning" showIcon title="日期数量不足，暂不能判断趋势" description="当前仅有一个数据日期。下方保留单日汇总，未生成伪造折线。" /><MetricCards metrics={calculateMetrics(rows)} /></> : <>
    <div style={{ marginTop: 16 }}><MovingAverageControls windows={windows} setWindows={setWindows} /></div>
    {dates.length < 14 && windows.includes(14) && <Alert style={{ marginTop: 12 }} type="info" showIcon title={`当前只有 ${dates.length} 个有效日期，14 日移动平均将在第 14 个有效日期后开始显示。`} />}
    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>{metricCharts.map((chart) => <Col xs={24} xl={12} key={chart.metric}><TrendMetricChart title={chart.title} data={data} metric={chart.metric} formatter={chart.formatter} tickFormatter={chart.tickFormatter} windows={windows} rawColor={chart.color} /></Col>)}</Row>
  </>}</>;
}

const relationKey = (row: AdsRecord) => [row.product ?? '未分类产品', row.store ?? '', row.campaign ?? ''].join('|');
const compareText = (left: string | null | undefined, right: string | null | undefined) =>
  (left ?? '').localeCompare(right ?? '', 'zh-CN', { numeric: true, sensitivity: 'base' });
const compareNumber = (left: number | null | undefined, right: number | null | undefined) =>
  (left ?? -1) - (right ?? -1);

interface SearchTermSummary extends Metrics {
  key: string;
  dateRange: string;
  product: string;
  store: string;
  campaign: string;
  searchTerm: string;
  searchTermTranslation: string;
  target: string;
  matchType: string;
  adGroup: string;
  portfolio: string;
  linked: boolean;
}

const summaryText = (rows: AdsRecord[], field: keyof Pick<AdsRecord, 'searchTermTranslation' | 'target' | 'matchType' | 'adGroup' | 'portfolio'>) => {
  const values = [...new Set(rows.map((row) => row[field]).filter((value): value is string => Boolean(value)))];
  return values.length ? values.join('、') : '—';
};

function buildSearchTermSummaries(rows: AdsRecord[], campaignKeys: Set<string>) {
  return groupRecords(rows, (row) => [
    row.product ?? '未分类产品', row.store ?? '未知店铺', row.campaign ?? '未命名活动', row.searchTerm ?? '未命名搜索词',
  ].join('\u0001')).map((group): SearchTermSummary => {
    const sample = group.records[0]!;
    const dates = group.records.map((row) => row.date).filter((value): value is string => Boolean(value)).sort();
    return {
      key: group.name,
      dateRange: dates.length ? `${dates[0]} 至 ${dates.at(-1)}` : '—',
      product: sample.product ?? '未分类产品',
      store: sample.store ?? '未知店铺',
      campaign: sample.campaign ?? '未命名活动',
      searchTerm: sample.searchTerm ?? '未命名搜索词',
      searchTermTranslation: summaryText(group.records, 'searchTermTranslation'),
      target: summaryText(group.records, 'target'),
      matchType: summaryText(group.records, 'matchType'),
      adGroup: summaryText(group.records, 'adGroup'),
      portfolio: summaryText(group.records, 'portfolio'),
      linked: campaignKeys.has(relationKey(sample)),
      ...calculateMetrics(group.records),
    };
  });
}

export function SearchTermsPage() {
  const { records, filtered } = useAds(); const [params] = useSearchParams(); const [search, setSearch] = useState('');
  const campaignParam = params.get('campaign'); const productParam = params.get('product');
  const campaignKeys = new Set(records.filter((row) => row.reportType === 'campaign').map(relationKey));
  const searchRecords = records.filter((row) => row.reportType === 'searchTerm');
  const detailRows = filtered.filter((row) => row.reportType === 'searchTerm' && (!campaignParam || row.campaign === campaignParam) && (!productParam || row.product === productParam));
  const rows = buildSearchTermSummaries(detailRows, campaignKeys).filter((row) => !search || `${row.searchTerm} ${row.searchTermTranslation} ${row.campaign} ${row.adGroup} ${row.target}`.toLowerCase().includes(search.toLowerCase()));
  const linked = rows.filter((row) => row.linked).length;
  return <><PageTitle title="搜索词分析" subtitle="按所选日期范围汇总搜索词；可筛选广告活动并点击搜索词查看每日趋势" extra={<Tag color={linked === rows.length ? 'success' : 'warning'}>{linked} / {rows.length} 个搜索词已关联</Tag>} /><DataScope reportTypes={['searchTerm']} />{!searchRecords.length ? <Card style={{ marginTop: 16 }}><Empty description="尚未导入搜索词日报" /></Card> : <><MetricCards metrics={calculateMetrics(detailRows)} /><Card style={{ marginTop: 16 }} title="搜索词汇总明细" extra={<Text type="secondary">每个搜索词按产品、店铺和广告活动汇总</Text>}><Input.Search allowClear style={{ maxWidth: 420, marginBottom: 16 }} placeholder="搜索用户搜索词、翻译、投放或广告活动" onChange={(event) => setSearch(event.target.value)} /><Table<SearchTermSummary> rowKey="key" size="small" dataSource={rows} scroll={{ x: 1900 }} pagination={tablePagination(20)} columns={[
    { title: '日期范围', dataIndex: 'dateRange', fixed: 'left', width: 210, sorter: (a, b) => compareText(a.dateRange, b.dateRange) },
    { title: '产品', dataIndex: 'product', width: 120, sorter: (a, b) => compareText(a.product, b.product) },
    { title: '店铺', dataIndex: 'store', width: 85, sorter: (a, b) => compareText(a.store, b.store) },
    { title: '用户搜索词', dataIndex: 'searchTerm', fixed: 'left', width: 220, ellipsis: true, sorter: (a, b) => compareText(a.searchTerm, b.searchTerm), render: (value: string, row) => <Link to={`/search-term-detail?searchTerm=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product)}&campaign=${encodeURIComponent(row.campaign)}`}>{value}　›</Link> },
    { title: '翻译', dataIndex: 'searchTermTranslation', width: 150, ellipsis: true, sorter: (a, b) => compareText(a.searchTermTranslation, b.searchTermTranslation) },
    { title: '投放', dataIndex: 'target', width: 190, ellipsis: true, sorter: (a, b) => compareText(a.target, b.target) },
    { title: '匹配类型', dataIndex: 'matchType', width: 100, sorter: (a, b) => compareText(a.matchType, b.matchType) },
    { title: '广告组', dataIndex: 'adGroup', width: 220, ellipsis: true, sorter: (a, b) => compareText(a.adGroup, b.adGroup) },
    { title: '广告活动', dataIndex: 'campaign', width: 240, ellipsis: true, sorter: (a, b) => compareText(a.campaign, b.campaign), render: (value: string, row) => <Link to={`/campaign-detail?campaign=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product)}`}>{value}</Link> },
    { title: '广告组合', dataIndex: 'portfolio', width: 130, sorter: (a, b) => compareText(a.portfolio, b.portfolio) },
    { title: '关联', dataIndex: 'linked', width: 100, sorter: (a, b) => Number(a.linked) - Number(b.linked), render: (value: boolean) => <Tag color={value ? 'success' : 'warning'}>{value ? '已关联' : '待活动报表'}</Tag> },
    { title: '曝光', dataIndex: 'impressions', width: 90, align: 'right', render: integer, sorter: (a, b) => compareNumber(a.impressions, b.impressions) },
    { title: '点击', dataIndex: 'clicks', width: 80, align: 'right', render: integer, sorter: (a, b) => compareNumber(a.clicks, b.clicks) },
    { title: '花费', dataIndex: 'spend', width: 90, align: 'right', render: money, sorter: (a, b) => compareNumber(a.spend, b.spend) },
    { title: '订单', dataIndex: 'orders', width: 75, align: 'right', render: integer, sorter: (a, b) => compareNumber(a.orders, b.orders) },
    { title: '销售额', dataIndex: 'sales', width: 95, align: 'right', render: money, sorter: (a, b) => compareNumber(a.sales, b.sales) },
    { title: 'ACOS', dataIndex: 'acos', width: 85, align: 'right', render: percent, sorter: (a, b) => compareNumber(a.acos, b.acos) },
  ]} /></Card></>}</>;
}

export function SearchTermDetailPage() {
  const [searchParams] = useSearchParams();
  const searchTerm = searchParams.get('searchTerm') ?? '';
  const productName = searchParams.get('product');
  const campaignName = searchParams.get('campaign');
  const navigate = useNavigate();
  const { records } = useAds();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [windows, setWindows] = useState<MovingAverageWindow[]>([3, 5, 7, 14]);
  useEffect(() => setDateRange(null), [searchTerm, productName, campaignName]);

  const termRows = records.filter((record) => record.reportType === 'searchTerm'
    && record.searchTerm === searchTerm
    && (!productName || (record.product ?? '未分类产品') === productName)
    && (!campaignName || record.campaign === campaignName));
  const availableDates = [...new Set(termRows.map((record) => record.date).filter((value): value is string => Boolean(value)))].sort();
  const rows = termRows.filter((record) => !dateRange || Boolean(record.date && record.date >= dateRange[0] && record.date <= dateRange[1]));
  const data = buildTrendData(rows);
  const maxDate = availableDates.length ? dayjs(availableDates.at(-1)) : null;
  const presets = maxDate ? [
    { label: '最近 7 日', value: [maxDate.subtract(6, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 10 日', value: [maxDate.subtract(9, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 30 日', value: [maxDate.subtract(29, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '全部日期', value: [dayjs(availableDates[0]), maxDate] as [Dayjs, Dayjs] },
  ] : [];

  if (!termRows.length) return <><Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/search-terms')}>返回搜索词分析</Button><Result status="404" title="未找到该搜索词" subTitle={searchTerm} /></>;

  const translations = [...new Set(termRows.map((record) => record.searchTermTranslation).filter((value): value is string => Boolean(value)))];
  const stores = [...new Set(termRows.map((record) => record.store).filter((value): value is string => Boolean(value)))];
  const campaigns = [...new Set(termRows.map((record) => record.campaign).filter((value): value is string => Boolean(value)))];
  const dateDescription = data.length ? `${data[0]!.name} 至 ${data.at(-1)!.name}，连续显示 ${data.length} 日` : '所选日期无数据';

  return <>
    <Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/search-terms')}>返回搜索词分析</Button>
    <PageTitle title={searchTerm || '未命名搜索词'} subtitle={translations.length ? translations.join('、') : '该搜索词的每日表现与移动平均趋势'} extra={<Space wrap><Tag color="purple">{productName || termRows[0]?.product || '未分类产品'}</Tag><Tag>{stores.join('、') || '未知店铺'}</Tag><Tag color="blue">{campaigns.length} 个广告活动</Tag></Space>} />
    <Card size="small" style={{ marginTop: 20 }}><Flex gap={12} align="center" wrap><Text strong>所有折线图日期范围</Text><DatePicker.RangePicker aria-label="选择搜索词日期范围" presets={presets} value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null} onChange={(values) => setDateRange(values ? [values[0]!.format('YYYY-MM-DD'), values[1]!.format('YYYY-MM-DD')] : null)} /><Text type="secondary">{dateDescription}；无记录日期自动补齐</Text></Flex></Card>
    {!rows.length ? <Card style={{ marginTop: 16 }}><Empty description="所选日期范围内没有数据" /></Card> : <>
      <MetricCards metrics={calculateMetrics(rows)} />
      <div style={{ marginTop: 16 }}><MovingAverageControls windows={windows} setWindows={setWindows} /></div>
      {data.length < 14 && windows.includes(14) && <Alert style={{ marginTop: 12 }} type="info" showIcon title={`当前连续日期范围为 ${data.length} 日，14 日移动平均将在第 14 日后开始显示。`} />}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>{metricCharts.map((chart) => <Col xs={24} xl={12} key={chart.metric}><TrendMetricChart title={chart.title} data={data} metric={chart.metric} formatter={chart.formatter} tickFormatter={chart.tickFormatter} windows={windows} rawColor={chart.color} /></Col>)}</Row>
      <Card style={{ marginTop: 16 }} title="每日原始明细" styles={{ body: { padding: 0 } }}><Table rowKey="id" size="small" dataSource={[...rows].sort((a, b) => compareText(a.date, b.date))} pagination={tablePagination(20)} scroll={{ x: 1300 }} columns={[
        { title: '日期', dataIndex: 'date', fixed: 'left', width: 110, sorter: (a, b) => compareText(a.date, b.date) },
        { title: '广告活动', dataIndex: 'campaign', width: 260, ellipsis: true, sorter: (a, b) => compareText(a.campaign, b.campaign), render: (value: string | null, row: AdsRecord) => value ? <Link to={`/campaign-detail?campaign=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product ?? '未分类产品')}`}>{value}</Link> : '—' },
        { title: '广告组', dataIndex: 'adGroup', width: 220, ellipsis: true, sorter: (a, b) => compareText(a.adGroup, b.adGroup) },
        { title: '投放', dataIndex: 'target', width: 200, ellipsis: true, sorter: (a, b) => compareText(a.target, b.target) },
        { title: '匹配类型', dataIndex: 'matchType', width: 110, sorter: (a, b) => compareText(a.matchType, b.matchType) },
        { title: '曝光', dataIndex: 'impressions', width: 85, align: 'right', render: integer, sorter: (a, b) => compareNumber(a.impressions, b.impressions) },
        { title: '点击', dataIndex: 'clicks', width: 75, align: 'right', render: integer, sorter: (a, b) => compareNumber(a.clicks, b.clicks) },
        { title: '花费', dataIndex: 'spend', width: 90, align: 'right', render: money, sorter: (a, b) => compareNumber(a.spend, b.spend) },
        { title: '订单', dataIndex: 'orders', width: 75, align: 'right', render: integer, sorter: (a, b) => compareNumber(a.orders, b.orders) },
        { title: '销售额', dataIndex: 'sales', width: 95, align: 'right', render: money, sorter: (a, b) => compareNumber(a.sales, b.sales) },
        { title: 'ACOS', width: 85, align: 'right', render: (_: unknown, row: AdsRecord) => percent(calculateMetrics([row]).acos), sorter: (a, b) => compareNumber(calculateMetrics([a]).acos, calculateMetrics([b]).acos) },
      ]} /></Card>
    </>}
  </>;
}

interface CampaignPlacementSummary extends Metrics {
  key: string;
  product: string;
  campaign: string;
  placementCount: number;
}

function CampaignPlacementSummaryTable({ rows }: { rows: AdsRecord[] }) {
  const data = groupRecords(rows, (row) => `${row.product ?? '未分类产品'}::${row.campaign ?? '未命名活动'}`)
    .map((group): CampaignPlacementSummary => ({
      key: group.name,
      product: group.records[0]?.product ?? '未分类产品',
      campaign: group.records[0]?.campaign ?? '未命名活动',
      placementCount: new Set(group.records.map((row) => row.placement ?? '未命名广告位')).size,
      ...calculateMetrics(group.records),
    }))
    .sort((a, b) => b.spend - a.spend);
  if (!data.length) return null;
  return <Card style={{ marginTop: 16 }} title={<Space orientation="vertical" size={0}><Text strong style={{ fontSize: 16 }}>按广告活动汇总广告位</Text><Text type="secondary" style={{ fontSize: 12 }}>点击广告活动，按日对比该活动的不同广告位</Text></Space>} extra={<Tag color="blue">{data.length} 个活动</Tag>}>
    <Table<CampaignPlacementSummary> rowKey="key" size="small" dataSource={data} pagination={tablePagination()} scroll={{ x: 1080 }} columns={[
      { title: '产品', dataIndex: 'product', width: 130 },
      { title: '广告活动', dataIndex: 'campaign', width: 330, ellipsis: true, render: (value, row) => <Link to={`/campaign-placement-detail?campaign=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product)}`}>{value}　›</Link> },
      { title: '广告位数', dataIndex: 'placementCount', width: 100, align: 'right', render: (value) => <Tag color="purple">{value} 个</Tag> },
      { title: '花费', dataIndex: 'spend', width: 105, align: 'right', render: money },
      { title: '销售额', dataIndex: 'sales', width: 105, align: 'right', render: money },
      { title: '订单', dataIndex: 'orders', width: 80, align: 'right', render: integer },
      { title: 'CTR', dataIndex: 'ctr', width: 90, align: 'right', render: percent },
      { title: '转化率', dataIndex: 'conversionRate', width: 90, align: 'right', render: percent },
      { title: 'ACOS', dataIndex: 'acos', width: 90, align: 'right', render: percent },
    ]} />
  </Card>;
}

export function PlacementPage() {
  const { records, filtered } = useAds(); const [params] = useSearchParams();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('dateDesc');
  const [detailCampaignKey, setDetailCampaignKey] = useState<string | null>(null);
  const campaignParam = params.get('campaign'); const productParam = params.get('product');
  const placementRecords = records.filter((row) => row.reportType === 'placement');
  const rows = filtered.filter((row) => row.reportType === 'placement' && (!campaignParam || row.campaign === campaignParam) && (!productParam || row.product === productParam));
  const campaignChoices = [...new Map(rows.filter((row) => row.campaign).map((row) => {
    const product = row.product ?? '未分类产品'; const campaign = row.campaign!; const key = `${product}\u0000${campaign}`;
    return [key, { value: key, label: `${product} · ${campaign}`, product, campaign }];
  })).values()].sort((a, b) => a.label.localeCompare(b.label));
  const selectedCampaign = campaignChoices.find((choice) => choice.value === detailCampaignKey) ?? null;
  const detailRows = selectedCampaign ? rows.filter((row) => (row.product ?? '未分类产品') === selectedCampaign.product && row.campaign === selectedCampaign.campaign) : rows;
  const chartData = groupRecords(detailRows, (row) => row.placement ?? '未命名广告位').sort((a, b) => b.spend - a.spend);
  const sortedRows = [...detailRows].sort((a, b) => {
    if (sortBy === 'dateAsc') return (a.date ?? '').localeCompare(b.date ?? '');
    if (sortBy === 'dateDesc') return (b.date ?? '').localeCompare(a.date ?? '');
    const metric = sortBy.replace(/(Asc|Desc)$/, '') as 'spend' | 'sales' | 'orders' | 'ctr' | 'conversionRate' | 'acos';
    const direction = sortBy.endsWith('Asc') ? 1 : -1;
    const value = (row: AdsRecord) => metric in row ? (row[metric as 'spend' | 'sales' | 'orders'] ?? -1) : (calculateMetrics([row])[metric as 'ctr' | 'conversionRate' | 'acos'] ?? -1);
    return (value(a) - value(b)) * direction;
  });
  const ratioSorter = (metric: 'ctr' | 'conversionRate' | 'acos') => (a: AdsRecord, b: AdsRecord) => (calculateMetrics([a])[metric] ?? -1) - (calculateMetrics([b])[metric] ?? -1);
  const sortOptions = [{ value: 'dateDesc', label: '日期：从新到旧' }, { value: 'dateAsc', label: '日期：从旧到新' }, { value: 'spendDesc', label: '花费：从高到低' }, { value: 'salesDesc', label: '销售额：从高到低' }, { value: 'ordersDesc', label: '订单：从高到低' }, { value: 'ctrDesc', label: 'CTR：从高到低' }, { value: 'conversionRateDesc', label: '转化率：从高到低' }, { value: 'acosAsc', label: 'ACOS：从低到高' }];
  return <><PageTitle title="广告位分析" subtitle="按广告活动汇总广告位；点击活动后按日对比不同广告位的 CTR、转化率和 ACOS" /><DataScope reportTypes={['placement']} />{!placementRecords.length ? <Card style={{ marginTop: 16 }}><Empty description="尚未导入广告位日报" /></Card> : <><MetricCards metrics={calculateMetrics(detailRows)} /><CampaignPlacementSummaryTable rows={rows} /><Row gutter={[16, 16]} style={{ marginTop: 16 }}><Col xs={24} xl={10}><ChartCard title="广告位花费与销售额" height={380}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 18, left: 4, bottom: 38 }}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={66} /><YAxis /><Tooltip formatter={(value) => typeof value === 'number' ? money(value) : value} /><Legend /><Bar dataKey="spend" name="广告花费" fill="#0072B2" radius={[5, 5, 0, 0]} /><Bar dataKey="sales" name="广告销售额" fill="#009E73" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard></Col><Col xs={24} xl={14}><Card title="广告位明细" extra={<Space wrap><Select allowClear showSearch aria-label="选择广告活动分析" placeholder="选择广告活动" value={detailCampaignKey} style={{ width: 300 }} options={campaignChoices.map(({ value, label }) => ({ value, label }))} onChange={(value) => setDetailCampaignKey(value ?? null)} /><Button type="primary" disabled={!selectedCampaign} onClick={() => selectedCampaign && void navigate(`/campaign-placement-detail?campaign=${encodeURIComponent(selectedCampaign.campaign)}&product=${encodeURIComponent(selectedCampaign.product)}`)}>分析所选活动</Button><Text type="secondary">排序</Text><Select aria-label="选择广告位明细排序方式" value={sortBy} style={{ width: 180 }} options={sortOptions} onChange={setSortBy} /></Space>} styles={{ body: { padding: 0 } }}><Table rowKey="id" size="small" dataSource={sortedRows} scroll={{ x: 1420 }} pagination={tablePagination()} columns={[{ title: '日期', dataIndex: 'date', fixed: 'left', width: 105, sorter: (a, b) => (a.date ?? '').localeCompare(b.date ?? '') }, { title: '产品', dataIndex: 'product', width: 120, sorter: (a, b) => (a.product ?? '').localeCompare(b.product ?? '') }, { title: '广告位', dataIndex: 'placement', fixed: 'left', width: 190, sorter: (a, b) => (a.placement ?? '').localeCompare(b.placement ?? ''), render: (value: string | null, row: AdsRecord) => <Link to={`/placement-detail?placement=${encodeURIComponent(value ?? '未命名广告位')}&product=${encodeURIComponent(row.product ?? '未分类产品')}&campaign=${encodeURIComponent(row.campaign ?? '')}`}>{value ?? '未命名广告位'}　›</Link> }, { title: '广告活动', dataIndex: 'campaign', width: 230, ellipsis: true, sorter: (a, b) => (a.campaign ?? '').localeCompare(b.campaign ?? ''), render: (value: string | null, row: AdsRecord) => value ? <Link to={`/campaign-placement-detail?campaign=${encodeURIComponent(value)}&product=${encodeURIComponent(row.product ?? '未分类产品')}`}>{value}　›</Link> : '—' }, { title: '广告组合', dataIndex: 'portfolio', width: 130 }, { title: '曝光', dataIndex: 'impressions', width: 85, render: integer, sorter: (a, b) => (a.impressions ?? -1) - (b.impressions ?? -1) }, { title: '点击', dataIndex: 'clicks', width: 75, render: integer, sorter: (a, b) => (a.clicks ?? -1) - (b.clicks ?? -1) }, { title: '花费', dataIndex: 'spend', width: 90, render: money, sorter: (a, b) => (a.spend ?? -1) - (b.spend ?? -1) }, { title: '订单', dataIndex: 'orders', width: 75, render: integer, sorter: (a, b) => (a.orders ?? -1) - (b.orders ?? -1) }, { title: '销售额', dataIndex: 'sales', width: 95, render: money, sorter: (a, b) => (a.sales ?? -1) - (b.sales ?? -1) }, { title: 'CTR', width: 85, render: (_: unknown, row: AdsRecord) => percent(calculateMetrics([row]).ctr), sorter: ratioSorter('ctr') }, { title: '转化率', width: 90, render: (_: unknown, row: AdsRecord) => percent(calculateMetrics([row]).conversionRate), sorter: ratioSorter('conversionRate') }, { title: 'ACOS', width: 80, render: (_: unknown, row: AdsRecord) => percent(calculateMetrics([row]).acos), sorter: ratioSorter('acos') }]} /></Card></Col></Row></>}</>;
}

const PLACEMENT_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9'];

function CampaignPlacementTrendChart({ title, rows, metric, formatter }: { title: string; rows: AdsRecord[]; metric: 'ctr' | 'conversionRate' | 'acos'; formatter: (value: number | null) => string }) {
  const placements = [...new Set(rows.map((row) => row.placement ?? '未命名广告位'))].sort();
  const availableDates = [...new Set(rows.map((row) => row.date).filter((value): value is string => Boolean(value)))].sort();
  const dates: string[] = [];
  if (availableDates.length) {
    let date = dayjs(availableDates[0]); const end = dayjs(availableDates.at(-1));
    while (date.isBefore(end) || date.isSame(end, 'day')) { dates.push(date.format('YYYY-MM-DD')); date = date.add(1, 'day'); }
  }
  const data = dates.map((date) => Object.fromEntries([
    ['name', date],
    ...placements.map((placement) => [placement, calculateMetrics(rows.filter((row) => row.date === date && (row.placement ?? '未命名广告位') === placement))[metric]]),
  ]));
  const chartWidth = Math.max(760, dates.length * 68);
  return <ChartCard title={title} height={430} extra={<Text type="secondary">每条线代表一个广告位</Text>}><div style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden' }}><div style={{ width: chartWidth, height: '100%' }}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 16, right: 26, left: 8, bottom: 8 }}>
    <CartesianGrid strokeDasharray="2 4" vertical={false} />
    <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={76} tickMargin={10} tickFormatter={(value) => dayjs(String(value)).format('MM-DD')} />
    <YAxis width={66} tickFormatter={(value) => formatter(Number(value))} />
    <Tooltip labelFormatter={(label) => `日期：${String(label)}`} formatter={(value, name) => [typeof value === 'number' ? formatter(value) : '—', name]} />
    <Legend verticalAlign="top" height={42} />
    {placements.map((placement, index) => <Line key={placement} type="monotone" dataKey={placement} name={placement} stroke={PLACEMENT_COLORS[index % PLACEMENT_COLORS.length]} strokeWidth={2.4} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls={false} />)}
  </LineChart></ResponsiveContainer></div></div></ChartCard>;
}

export function CampaignPlacementDetailPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const { records } = useAds();
  const campaignName = params.get('campaign') ?? ''; const productName = params.get('product');
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const allRows = records.filter((row) => row.reportType === 'placement' && row.campaign === campaignName && (!productName || (row.product ?? '未分类产品') === productName));
  const allDates = [...new Set(allRows.map((row) => row.date).filter((value): value is string => Boolean(value)))].sort();
  const rows = allRows.filter((row) => !dateRange || Boolean(row.date && row.date >= dateRange[0] && row.date <= dateRange[1]));
  const dates = [...new Set(rows.map((row) => row.date).filter((value): value is string => Boolean(value)))].sort();
  const placements = groupRecords(rows, (row) => row.placement ?? '未命名广告位').sort((a, b) => b.spend - a.spend);
  const maxDate = allDates.length ? dayjs(allDates.at(-1)) : null;
  const presets = maxDate ? [{ label: '最近 7 日', value: [maxDate.subtract(6, 'day'), maxDate] as [Dayjs, Dayjs] }, { label: '最近 10 日', value: [maxDate.subtract(9, 'day'), maxDate] as [Dayjs, Dayjs] }, { label: '最近 30 日', value: [maxDate.subtract(29, 'day'), maxDate] as [Dayjs, Dayjs] }, { label: '全部日期', value: [dayjs(allDates[0]), maxDate] as [Dayjs, Dayjs] }] : [];
  if (!allRows.length) return <><Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/placements')}>返回广告位分析</Button><Result status="404" title="未找到该广告活动的广告位数据" subTitle={campaignName} /></>;
  return <>
    <Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/placements')}>返回广告位分析</Button>
    <PageTitle title={campaignName} subtitle="按日对比该广告活动的不同广告位表现" extra={<Space wrap><Tag color="purple">{productName || allRows[0]?.product || '未分类产品'}</Tag><Tag color="blue">{placements.length} 个广告位</Tag></Space>} />
    <Card size="small" style={{ marginTop: 20 }}><Flex gap={12} align="center" wrap><Text strong>日期范围</Text><DatePicker.RangePicker aria-label="选择广告活动广告位日期范围" presets={presets} value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null} onChange={(values) => setDateRange(values ? [values[0]!.format('YYYY-MM-DD'), values[1]!.format('YYYY-MM-DD')] : null)} /><Text type="secondary">{dates.length ? `${dates[0]} 至 ${dates.at(-1)}，逐日显示，共 ${dates.length} 日` : '所选日期无数据'}</Text></Flex></Card>
    {!rows.length ? <Card style={{ marginTop: 16 }}><Empty description="所选日期范围内没有数据" /></Card> : <>
      <MetricCards metrics={calculateMetrics(rows)} />
      <Card style={{ marginTop: 16 }} title="广告位汇总"><Table size="small" rowKey="name" dataSource={placements} pagination={false} scroll={{ x: 980 }} columns={[
        { title: '广告位', dataIndex: 'name', width: 230, render: (value) => <Link to={`/placement-detail?placement=${encodeURIComponent(value)}&product=${encodeURIComponent(productName || allRows[0]?.product || '未分类产品')}&campaign=${encodeURIComponent(campaignName)}`}>{value}　›</Link> },
        { title: '花费', dataIndex: 'spend', align: 'right', render: money }, { title: '销售额', dataIndex: 'sales', align: 'right', render: money }, { title: '订单', dataIndex: 'orders', align: 'right', render: integer }, { title: 'CTR', dataIndex: 'ctr', align: 'right', render: percent }, { title: '转化率', dataIndex: 'conversionRate', align: 'right', render: percent }, { title: 'ACOS', dataIndex: 'acos', align: 'right', render: percent },
      ]} /></Card>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}><Col span={24}><CampaignPlacementTrendChart title="不同广告位每日 CTR" rows={rows} metric="ctr" formatter={percent} /></Col><Col span={24}><CampaignPlacementTrendChart title="不同广告位每日转化率" rows={rows} metric="conversionRate" formatter={percent} /></Col><Col span={24}><CampaignPlacementTrendChart title="不同广告位每日 ACOS" rows={rows} metric="acos" formatter={percent} /></Col></Row>
    </>}
  </>;
}

export function PlacementDetailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { records } = useAds();
  const placementName = params.get('placement') ?? '';
  const productName = params.get('product');
  const campaignName = params.get('campaign');
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [windows, setWindows] = useState<MovingAverageWindow[]>([3, 5, 7, 14]);
  const allRows = records.filter((row) => row.reportType === 'placement'
    && (row.placement === placementName || (!row.placement && placementName === '未命名广告位'))
    && (!productName || (row.product ?? '未分类产品') === productName)
    && (!campaignName || row.campaign === campaignName));
  const allDates = [...new Set(allRows.map((row) => row.date).filter((value): value is string => Boolean(value)))].sort();
  const rows = allRows.filter((row) => !dateRange || Boolean(row.date && row.date >= dateRange[0] && row.date <= dateRange[1]));
  const dates = [...new Set(rows.map((row) => row.date).filter((value): value is string => Boolean(value)))].sort();
  const maxDate = allDates.length ? dayjs(allDates.at(-1)) : null;
  const presets = maxDate ? [
    { label: '最近 7 日', value: [maxDate.subtract(6, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 10 日', value: [maxDate.subtract(9, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '最近 30 日', value: [maxDate.subtract(29, 'day'), maxDate] as [Dayjs, Dayjs] },
    { label: '全部日期', value: [dayjs(allDates[0]), maxDate] as [Dayjs, Dayjs] },
  ] : [];
  if (!allRows.length) return <><Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/placements')}>返回广告位分析</Button><Result status="404" title="未找到该广告位" subTitle={placementName} /></>;
  const data = buildTrendData(rows);
  const charts = metricCharts.filter((chart) => ['ctr', 'conversionRate', 'acos', 'cpc'].includes(chart.metric));
  return <>
    <Button icon={<ArrowLeftOutlined />} onClick={() => void navigate('/placements')}>返回广告位分析</Button>
    <PageTitle title={placementName || '未命名广告位'} subtitle="按日查看该广告位的点击率、转化率、ACOS 和 CPC" extra={<Space wrap><Tag color="purple">{productName || allRows[0]?.product || '未分类产品'}</Tag>{campaignName && <Tag color="blue">{campaignName}</Tag>}<Tag>{allRows.length} 条记录</Tag></Space>} />
    <Card size="small" style={{ marginTop: 20 }}><Flex gap={12} align="center" wrap><Text strong>折线图日期范围</Text><DatePicker.RangePicker aria-label="选择广告位日期范围" presets={presets} value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null} onChange={(values) => setDateRange(values ? [values[0]!.format('YYYY-MM-DD'), values[1]!.format('YYYY-MM-DD')] : null)} /><Text type="secondary">{dates.length ? `${dates[0]} 至 ${dates.at(-1)}，共 ${dates.length} 日` : '所选日期无数据'}</Text></Flex></Card>
    {!rows.length ? <Card style={{ marginTop: 16 }}><Empty description="所选日期范围内没有数据" /></Card> : <>
      <MetricCards metrics={calculateMetrics(rows)} />
      <div style={{ marginTop: 16 }}><MovingAverageControls windows={windows} setWindows={setWindows} /></div>
      {dates.length < 14 && windows.includes(14) && <Alert style={{ marginTop: 12 }} type="info" showIcon title={`当前只有 ${dates.length} 个有效日期，14 日移动平均将在第 14 个有效日期后开始显示。`} />}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>{charts.map((chart) => <Col xs={24} xl={12} key={chart.metric}><TrendMetricChart title={chart.title} data={data} metric={chart.metric} formatter={chart.formatter} tickFormatter={chart.tickFormatter} windows={windows} rawColor={chart.color} /></Col>)}</Row>
    </>}
  </>;
}

export function ImportPage() {
  const { records, imports, preview, setPreview, commitPreview } = useAds(); const { message } = App.useApp(); const [busy, setBusy] = useState(false); const [productName, setProductName] = useState('');
  const productOptions = [...new Set([...records.map((record) => record.product), ...imports.map((batch) => batch.product)].filter((value): value is string => Boolean(value)))].sort().map((value) => ({ value }));
  useEffect(() => { void getSetting<string>('last-import-product').then((value) => { if (value) setProductName(value); }); }, []);
  const beforeUpload = async (file: File) => { setBusy(true); try { if (!productName.trim()) throw new Error('请先选择或输入产品名称'); if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('仅支持 .xlsx 文件'); let parsed = await parseExcel(file, productName); const savedMappings = await getSetting<Record<string, MappingTarget>>('mapping-rules'); if (savedMappings) { const mappings = parsed.mappings.map((mapping) => savedMappings[mapping.source] ? { ...mapping, target: savedMappings[mapping.source]!, status: 'matched' as const } : mapping); parsed = remapPreview(parsed, mappings); } await setSetting('last-import-product', productName.trim()); setPreview(parsed); message.success('文件解析完成，请核对产品、字段与数据后确认导入'); } catch (error) { message.error(error instanceof Error ? error.message : '解析失败'); } finally { setBusy(false); } return false; };
  const updateMapping = (source: string, target: MappingTarget | null) => {
    if (!preview) return;
    const mappings = preview.mappings.map((mapping) => {
      if (mapping.source === source) return { ...mapping, target, status: target ? 'matched' as const : 'unconfirmed' as const };
      if (target && mapping.target === target) return { ...mapping, target: null, status: 'unconfirmed' as const };
      return mapping;
    });
    setPreview(remapPreview(preview, mappings));
  };
  return <><PageTitle title="数据导入" subtitle="先选择产品，再预览、识别和校验 Excel 数据" /><Card style={{ marginTop: 20 }}><Space orientation="vertical" size={16} style={{ display: 'flex' }}><div><Text strong>所属产品</Text><Text type="secondary" style={{ marginLeft: 8 }}>必填，可选择已有产品或直接输入新产品名称</Text><AutoComplete style={{ display: 'block', maxWidth: 420, marginTop: 8 }} value={productName} options={productOptions} onChange={setProductName} placeholder="例如：SW拔罐器" allowClear /></div><Upload.Dragger accept=".xlsx" maxCount={1} showUploadList={false} beforeUpload={beforeUpload} disabled={busy || !productName.trim()}><p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">拖拽或点击选择赛虎 ERP Excel 报表</p><p className="ant-upload-hint">支持 .xlsx；本次文件中的所有记录都将归入“{productName.trim() || '待选择产品'}”</p></Upload.Dragger></Space></Card>{preview && <Space orientation="vertical" size={16} style={{ display: 'flex', marginTop: 16 }}>
    {preview.warnings.map((warning) => <Alert key={warning} type="warning" showIcon title={warning} />)}
    {preview.errors.length > 0 && <Alert type="error" showIcon title={`发现 ${preview.errors.length} 个校验问题`} description={preview.errors.slice(0, 6).join('；')} />}
    <Card title="导入预览" extra={<Space><Button onClick={() => setPreview(null)}>取消</Button><Button type="primary" icon={<UploadOutlined />} disabled={!preview.records.length} onClick={() => void commitPreview()}>确认导入</Button></Space>}><Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }} items={[
      { key: 'product', label: '所属产品', children: <Tag color="blue">{preview.batch.product}</Tag> }, { key: 'file', label: '文件名', children: preview.batch.fileName }, { key: 'sheet', label: '工作表', children: preview.batch.sheetName }, { key: 'count', label: '记录数', children: preview.batch.totalRows }, { key: 'type', label: '报告类型', children: reportTypeLabel(preview.batch.reportType) },
      { key: 'date', label: '日期范围', children: `${preview.batch.dateMin ?? '—'} 至 ${preview.batch.dateMax ?? '—'}` }, { key: 'store', label: '表内店铺', children: preview.batch.stores.join('、') || '—' }, { key: 'success', label: '可读取记录', children: preview.records.length }, { key: 'failed', label: '校验问题', children: preview.errors.length },
    ]} /></Card>
    <Card title="字段识别" extra={<Text type="secondary">可手动纠正；同一个系统字段只能映射一次</Text>}><Table size="small" pagination={false} rowKey="source" dataSource={preview.mappings} columns={[{ title: '原始字段', dataIndex: 'source' }, { title: '系统字段', dataIndex: 'target', render: (value, row) => <Select allowClear showSearch style={{ minWidth: 160 }} placeholder="未映射" value={value ?? undefined} options={MAPPING_TARGET_OPTIONS} onChange={(target) => updateMapping(row.source, target ?? null)} /> }, { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === 'matched' ? 'success' : 'warning'}>{v === 'matched' ? '已识别' : '待确认（原样保留）'}</Tag> }]} /></Card>
    <Card title="前 10 条原始数据"><Table size="small" rowKey="id" dataSource={preview.records.slice(0, 10)} columns={preview.batch.headers.slice(0, 12).map((header) => ({ title: header, ellipsis: true, render: (_: unknown, row: AdsRecord) => row.raw[header] === null ? <Text type="secondary">null</Text> : String(row.raw[header] ?? '') }))} scroll={{ x: 'max-content' }} pagination={false} /></Card>
  </Space>}</>;
}

export function ManagementPage() {
  const { imports, records, removeImport, exportBackup, restoreBackup } = useAds(); const { modal, message } = App.useApp();
  const handleRestore = async (file: File) => { try { await restoreBackup(file); } catch (e) { message.error(e instanceof Error ? e.message : '恢复失败'); } return false; };
  return <><PageTitle title="数据管理" subtitle="管理导入批次、原始记录、本地备份与恢复" extra={<Space><Button icon={<DownloadOutlined />} disabled={!imports.length} onClick={exportBackup}>导出 JSON 备份</Button><Upload accept=".json" showUploadList={false} beforeUpload={handleRestore}><Button icon={<UploadOutlined />}>恢复备份</Button></Upload></Space>} /><Alert style={{ marginTop: 20 }} type="info" showIcon title="数据保存在此浏览器的 IndexedDB 中" description="IndexedDB 不等同于自动写入 Windows 文件夹。请定期导出 JSON 备份并保存到您选择的位置。" /><Card style={{ marginTop: 16 }} title={`导入记录（${imports.length} 个批次，${records.length} 条明细）`}><Table rowKey="id" dataSource={[...imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt))} columns={[
    { title: '产品', dataIndex: 'product', width: 140, render: (value: string | undefined) => value ?? '未分类产品' }, { title: '文件名', dataIndex: 'fileName', ellipsis: true }, { title: '报告类型', dataIndex: 'reportType', render: reportTypeLabel }, { title: '导入时间', dataIndex: 'importedAt', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') }, { title: '日期范围', render: (_, r) => `${r.dateMin ?? '—'} 至 ${r.dateMax ?? '—'}` }, { title: '成功', dataIndex: 'acceptedRows' }, { title: '重复', dataIndex: 'duplicateRows' }, { title: '失败', dataIndex: 'failedRows' },
    { title: '操作', render: (_, r) => <Button danger type="text" icon={<DeleteOutlined />} onClick={() => modal.confirm({ title: '删除这个导入批次？', content: '该批次写入的广告记录也会被删除，此操作不可撤销。', okButtonProps: { danger: true }, onOk: () => removeImport(r.id) })}>删除</Button> },
  ]} pagination={tablePagination(10)} /></Card></>;
}

export function SyncPage() {
  const { records, imports, reloadData } = useAds();
  const { message } = App.useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  useEffect(() => {
    void Promise.all([getCurrentSession(), getSetting<boolean>('cloud-sync-enabled'), getSetting<string>('cloud-last-sync')]).then(([current, savedEnabled, savedLast]) => {
      setSession(current); setEnabled(Boolean(current && savedEnabled)); setLastSync(savedLast);
    }).catch((error: unknown) => setSyncError(error instanceof Error ? error.message : '读取同步状态失败'));
    return subscribeToAuth(setSession);
  }, []);

  const setCloudEnabled = async (value: boolean) => {
    if (value && !session) { message.warning('请先登录，再启用云端同步'); return; }
    setEnabled(value); await setSetting('cloud-sync-enabled', value);
  };
  const submitAuth = async (values: { email: string; password: string }) => {
    setAuthBusy(true); setSyncError(null);
    try {
      if (authMode === 'signin') {
        const nextSession = await signIn(values.email, values.password); setSession(nextSession); message.success('登录成功');
      } else {
        const result = await signUp(values.email, values.password);
        if (result.session) { setSession(result.session); message.success('注册并登录成功'); }
        else message.info('注册成功。请按邮箱中的确认链接完成验证后再登录。');
      }
    } catch (error) { const text = error instanceof Error ? error.message : '身份验证失败'; setSyncError(text); message.error(text); }
    finally { setAuthBusy(false); }
  };
  const logout = async () => {
    await signOut(); setSession(null); setEnabled(false); await setSetting('cloud-sync-enabled', false); message.success('已退出登录，云同步已关闭');
  };
  const runSync = async () => {
    if (!session || !enabled) return;
    setSyncing(true); setSyncError(null);
    try {
      const result = await syncWithSupabase(session.user, records, imports);
      await replaceAll(result.records, result.imports); await reloadData();
      const completedAt = new Date().toISOString(); setLastSync(completedAt); await setSetting('cloud-last-sync', completedAt);
      message.success(`同步完成：云端 ${result.pulledRecords} 条，本地 ${result.records.length} 条记录`);
    } catch (error) { const text = error instanceof Error ? error.message : '同步失败'; setSyncError(text); message.error(text); }
    finally { setSyncing(false); }
  };

  const status = !isSupabaseConfigured ? '未配置' : !session ? '等待登录' : !enabled ? '已关闭' : syncing ? '同步中' : syncError ? '同步失败' : '已启用';
  return <><PageTitle title="本地与云端同步" subtitle="默认关闭；登录并主动开启后才会上传广告数据" /><Row gutter={[16, 16]} style={{ marginTop: 20 }}>
    <Col xs={24} lg={14}><Card><Space orientation="vertical" size={18} style={{ display: 'flex' }}>
      <Flex justify="space-between" align="center"><Space><CloudOutlined /><Text strong>Supabase 云端同步</Text></Space><Switch disabled={!isSupabaseConfigured || !session} checked={enabled} onChange={(value) => void setCloudEnabled(value)} /></Flex>
      {!isSupabaseConfigured && <Alert type="info" showIcon title="尚未配置云端凭证，本地功能不受影响" />}
      {syncError && <Alert type="error" showIcon title="操作失败" description={syncError} action={<Button size="small" disabled={!session || !enabled} onClick={() => void runSync()}>重试</Button>} />}
      <Descriptions column={1} size="small" items={[{ key: 'status', label: '同步状态', children: <Tag color={enabled ? 'processing' : undefined}>{status}</Tag> }, { key: 'last', label: '最近同步', children: lastSync ? dayjs(lastSync).format('YYYY-MM-DD HH:mm:ss') : '从未同步' }, { key: 'auth', label: '当前用户', children: session?.user.email ?? '未登录' }, { key: 'local', label: '本地数据', children: `${imports.length} 个批次，${records.length} 条记录` }]} />
      <Space><Button type="primary" icon={<SyncOutlined spin={syncing} />} disabled={!session || !enabled} loading={syncing} onClick={() => void runSync()}>立即双向同步</Button>{session && <Button onClick={() => void logout()}>退出登录</Button>}</Space>
    </Space></Card></Col>
    <Col xs={24} lg={10}>{session ? <Card title="账户已连接"><Result status="success" title="Supabase 身份验证成功" subTitle={session.user.email} /></Card> : <Card title={authMode === 'signin' ? '登录 Supabase' : '注册 Supabase 账户'}>
      <Form layout="vertical" onFinish={(values) => void submitAuth(values as { email: string; password: string })}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}><Input prefix={<MailOutlined />} autoComplete="email" /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}><Input.Password prefix={<LockOutlined />} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></Form.Item>
        <Button block type="primary" htmlType="submit" loading={authBusy}>{authMode === 'signin' ? '登录' : '注册'}</Button>
      </Form><Divider /><Button type="link" block onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>{authMode === 'signin' ? '没有账户？注册' : '已有账户？登录'}</Button>
    </Card>}</Col>
    <Col span={24}><Card title="安全与冲突处理"><Space orientation="vertical"><Text><SafetyCertificateOutlined /> 使用公开 publishable key；密码直接发送到 Supabase Auth，应用不保存密码</Text><Text>数据库已启用 Row Level Security，每个用户只能访问自己的数据</Text><Text>同步以记录 ID 和导入文件指纹合并；网络失败不会删除本地数据，可手动重试</Text><Text>本地数据仍可离线查看，退出登录会自动关闭同步开关</Text></Space></Card></Col>
  </Row></>;
}

export function SettingsPage() {
  const [currency, setCurrency] = useState(localStorage.getItem('ads.currency') ?? '未设置');
  return <><PageTitle title="系统设置" subtitle="金额单位需要用户确认，不会根据文件名或店铺自动推断" /><Card style={{ marginTop: 20, maxWidth: 720 }}><Form layout="vertical"><Form.Item label="金额单位" extra="仅影响显示标签，不会换算或修改原始数据"><Select value={currency} options={['未设置', 'USD', 'CAD', 'GBP', 'EUR', 'JPY'].map((v) => ({ value: v, label: v }))} onChange={(v) => { setCurrency(v); localStorage.setItem('ads.currency', v); }} /></Form.Item><Form.Item label="本地数据层"><Input value="IndexedDB（amazon-ads-analytics）" readOnly /></Form.Item><Form.Item label="界面语言"><Input value="简体中文为主，保留 Colony 中英文框架" readOnly /></Form.Item></Form><Divider /><Paragraph type="secondary">主题、深色模式和界面密度可在页面右上角调整。云端同步在“本地与云端同步”页面登录后由用户主动开启。</Paragraph></Card></>;
}
