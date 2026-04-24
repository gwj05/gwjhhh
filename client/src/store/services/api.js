import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQueryWithFarm } from '../baseQueryWithFarm'

/** 管理员「全部农场」用 'all'；否则为 farm_id 字符串 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithFarm,
  tagTypes: ['Warnings', 'StockWarnings', 'Auth', 'Farm', 'Homepage', 'Overview'],
  endpoints: (builder) => ({
    getHomeWeather: builder.query({
      query: (farmKey) => ({
        url: '/homepage/weather',
        // 显式传 all，防止 baseQuery 用 localStorage 覆盖为「某一农场」导致数据对不上
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [{ type: 'Homepage', id: `weather-${farmKey}` }]
    }),
    getHomeWeatherHistory: builder.query({
      query: ({ farmKey, range }) => ({
        url: '/homepage/weather-history',
        params: {
          range: range || '24h',
          ...(farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey })
        }
      }),
      providesTags: (result, err, { farmKey, range }) => [{ type: 'Homepage', id: `wx-${farmKey}-${range}` }]
    }),
    getHomeDeviceStats: builder.query({
      query: (farmKey) => ({
        url: '/homepage/device-stats',
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [{ type: 'Homepage', id: `dev-${farmKey}` }]
    }),
    getHomeStockWarnings: builder.query({
      query: (farmKey) => ({
        url: '/homepage/stock-warnings',
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [
        'StockWarnings',
        { type: 'Homepage', id: `stock-${farmKey}` }
      ]
    }),
    getHomeVideos: builder.query({
      query: (farmKey) => ({
        url: '/homepage/videos',
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [{ type: 'Homepage', id: `vid-${farmKey}` }]
    }),
    getHomePestRisk: builder.query({
      query: (farmKey) => ({
        url: '/homepage/pest-risk',
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [{ type: 'Homepage', id: `pest-${farmKey}` }]
    }),
    getOverviewAdvanced: builder.query({
      query: (farmKey) => ({
        url: '/overview/advanced',
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [{ type: 'Overview', id: `adv-${farmKey}` }]
    }),
    switchOverviewIrrigationStrategy: builder.mutation({
      query: ({ farmKey, strategy_key }) => ({
        url: '/overview/irrigation/switch',
        method: 'POST',
        body: { farm_id: farmKey === 'all' ? 'all' : farmKey, strategy_key }
      }),
      invalidatesTags: ['Overview']
    }),
    createOverviewPurchaseDraft: builder.mutation({
      query: ({ items, supplier }) => ({
        url: '/overview/purchase/draft',
        method: 'POST',
        body: { items, supplier }
      }),
      invalidatesTags: ['Overview', 'Homepage', 'StockWarnings']
    }),
    getHomeMapOverview: builder.query({
      query: (farmKey) => ({
        url: '/homepage/map-overview',
        params: farmKey === 'all' ? { farm_id: 'all' } : { farm_id: farmKey }
      }),
      providesTags: (result, err, farmKey) => [{ type: 'Homepage', id: `map-${farmKey}` }]
    }),
    getWarningList: builder.query({
      query: ({ farmKey, page = 1, pageSize = 10, handle_status } = {}) => ({
        url: '/warning/list',
        params: {
          page,
          pageSize,
          ...(handle_status ? { handle_status } : {}),
          ...(farmKey === 'all' ? { farm_id: 'all' } : farmKey ? { farm_id: farmKey } : {})
        }
      }),
      providesTags: ['Warnings']
    }),
    markWarningRead: builder.mutation({
      query: (warningId) => ({
        url: `/warning/read/${warningId}`,
        method: 'POST'
      }),
      invalidatesTags: ['Warnings', 'Homepage']
    })
  })
})

export const {
  useGetHomeWeatherQuery,
  useGetHomeWeatherHistoryQuery,
  useGetHomeDeviceStatsQuery,
  useGetHomeStockWarningsQuery,
  useGetHomeVideosQuery,
  useGetHomePestRiskQuery,
  useGetOverviewAdvancedQuery,
  useSwitchOverviewIrrigationStrategyMutation,
  useCreateOverviewPurchaseDraftMutation,
  useGetHomeMapOverviewQuery,
  useGetWarningListQuery,
  useMarkWarningReadMutation,
  useLazyGetWarningListQuery
} = api
