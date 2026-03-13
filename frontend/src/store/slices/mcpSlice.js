import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { getMcps, getMcpById, getTrendingMcps } from '../../services/mcpService'

export const fetchMcps = createAsyncThunk(
  'mcp/fetchMcps',
  async ({ page = 1, pageSize = 20, category, search, sort, sourcePlatform, sourceType }) => {
    const response = await getMcps({ page, pageSize, category, search, sort, sourcePlatform, sourceType })
    return response.data
  }
)

export const fetchMcpDetail = createAsyncThunk(
  'mcp/fetchMcpDetail',
  async (id) => {
    const response = await getMcpById(id)
    return response.data
  }
)

export const fetchTrendingMcps = createAsyncThunk(
  'mcp/fetchTrendingMcps',
  async ({ limit = 10, days = 30 } = {}) => {
    const response = await getTrendingMcps({ limit, days })
    return response.data
  }
)

const mcpSlice = createSlice({
  name: 'mcp',
  initialState: {
    list: [],
    total: 0,
    currentMcp: null,
    loading: false,
    error: null,
    trending: [],
    trendingLoading: false,
  },
  reducers: {
    clearCurrentMcp: (state) => {
      state.currentMcp = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMcps.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchMcps.fulfilled, (state, action) => {
        state.loading = false
        state.list = action.payload.items
        state.total = action.payload.total
      })
      .addCase(fetchMcps.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchMcpDetail.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchMcpDetail.fulfilled, (state, action) => {
        state.loading = false
        state.currentMcp = action.payload
      })
      .addCase(fetchMcpDetail.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchTrendingMcps.pending, (state) => {
        state.trendingLoading = true
      })
      .addCase(fetchTrendingMcps.fulfilled, (state, action) => {
        state.trendingLoading = false
        state.trending = action.payload
      })
      .addCase(fetchTrendingMcps.rejected, (state, action) => {
        state.trendingLoading = false
        state.error = action.error.message
      })
  },
})

export const { clearCurrentMcp } = mcpSlice.actions
export default mcpSlice.reducer
