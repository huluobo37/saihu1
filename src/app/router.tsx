import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { AsinHourlyRankMonitorPage, AsinTrafficKeywordsPage, CampaignDetailPage, CampaignKeywordRankingsPage, CampaignPage, CampaignPlacementDetailPage, ImportPage, KeywordLibraryPage, KeywordRankingsPage, ManagementPage, OverviewPage, PlacementDetailPage, PlacementPage, SearchTermDetailPage, SearchTermsPage, SettingsPage, SorftimeMarketPage, SyncPage, TrendsPage } from '@/ads/AdsPages';
import NotFoundPage from '@/pages/exception/NotFound';
export const router = createBrowserRouter([{ path: '/', Component: AppLayout, children: [
  { index: true, element: <Navigate to="/overview" replace /> }, { path: 'overview', Component: OverviewPage },
  { path: 'campaigns', Component: CampaignPage }, { path: 'campaign-detail', Component: CampaignDetailPage }, { path: 'trends', Component: TrendsPage },
  { path: 'search-terms', Component: SearchTermsPage }, { path: 'keyword-library', Component: KeywordLibraryPage }, { path: 'keyword-rankings', Component: KeywordRankingsPage }, { path: 'campaign-keyword-rankings', Component: CampaignKeywordRankingsPage }, { path: 'asin-hourly-rankings', Component: AsinHourlyRankMonitorPage }, { path: 'asin-traffic-keywords', Component: AsinTrafficKeywordsPage }, { path: 'sorftime-market', Component: SorftimeMarketPage }, { path: 'search-term-detail', Component: SearchTermDetailPage }, { path: 'placements', Component: PlacementPage }, { path: 'placement-detail', Component: PlacementDetailPage }, { path: 'campaign-placement-detail', Component: CampaignPlacementDetailPage }, { path: 'import', Component: ImportPage },
  { path: 'management', Component: ManagementPage }, { path: 'sync', Component: SyncPage },
  { path: 'settings', Component: SettingsPage }, { path: '*', Component: NotFoundPage },
]}]);
