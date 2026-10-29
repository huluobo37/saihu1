import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { CampaignDetailPage, CampaignPage, CampaignPlacementDetailPage, ImportPage, ManagementPage, OverviewPage, PlacementDetailPage, PlacementPage, SearchTermDetailPage, SearchTermsPage, SettingsPage, SyncPage, TrendsPage } from '@/ads/AdsPages';
import NotFoundPage from '@/pages/exception/NotFound';
export const router = createBrowserRouter([{ path: '/', Component: AppLayout, children: [
  { index: true, element: <Navigate to="/overview" replace /> }, { path: 'overview', Component: OverviewPage },
  { path: 'campaigns', Component: CampaignPage }, { path: 'campaign-detail', Component: CampaignDetailPage }, { path: 'trends', Component: TrendsPage },
  { path: 'search-terms', Component: SearchTermsPage }, { path: 'search-term-detail', Component: SearchTermDetailPage }, { path: 'placements', Component: PlacementPage }, { path: 'placement-detail', Component: PlacementDetailPage }, { path: 'campaign-placement-detail', Component: CampaignPlacementDetailPage }, { path: 'import', Component: ImportPage },
  { path: 'management', Component: ManagementPage }, { path: 'sync', Component: SyncPage },
  { path: 'settings', Component: SettingsPage }, { path: '*', Component: NotFoundPage },
]}]);
