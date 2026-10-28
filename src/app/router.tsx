import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { CampaignDetailPage, CampaignPage, ImportPage, ManagementPage, OverviewPage, PlacementPage, SearchTermsPage, SettingsPage, SyncPage, TrendsPage } from '@/ads/AdsPages';
import NotFoundPage from '@/pages/exception/NotFound';
export const router = createBrowserRouter([{ path: '/', Component: AppLayout, children: [
  { index: true, element: <Navigate to="/overview" replace /> }, { path: 'overview', Component: OverviewPage },
  { path: 'campaigns', Component: CampaignPage }, { path: 'campaign-detail', Component: CampaignDetailPage }, { path: 'trends', Component: TrendsPage },
  { path: 'search-terms', Component: SearchTermsPage }, { path: 'placements', Component: PlacementPage }, { path: 'import', Component: ImportPage },
  { path: 'management', Component: ManagementPage }, { path: 'sync', Component: SyncPage },
  { path: 'settings', Component: SettingsPage }, { path: '*', Component: NotFoundPage },
]}]);
