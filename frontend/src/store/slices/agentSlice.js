import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { getAgents, getAgentById, getTrendingAgents, getPlatformStats } from '../../services/agentService'

export const fetchAgents = createAsyncThunk(
  'agent/fetchAgents',
  async ({ page = 1, pageSize = 20, category, search }) => {
    const response = await getAgents({ page, pageSize, category, search })
    return response.data
  }
)

export const fetchAgentDetail = createAsyncThunk(
  'agent/fetchAgentDetail',
  async (id) => {
    const response = await getAgentById(id)
    return response.data
  }
)

export const fetchTrendingAgents = createAsyncThunk(
  'agent/fetchTrendingAgents',
  async ({ limit = 10 } = {}) => {
    const response = await getTrendingAgents({ limit })
    return response.data
  }
)

export const fetchPlatformStats = createAsyncThunk(
  'agent/fetchPlatformStats',
  async () => {
    const response = await getPlatformStats()
    return response.data
  }
)

const agentSlice = createSlice({
  name: 'agent',
  initialState: {
    list: [],
    total: 0,
    currentAgent: null,
    loading: false,
    error: null,
    trending: [],
    trendingLoading: false,
    stats: null,
    statsLoading: false,
  },
  reducers: {
    clearCurrentAgent: (state) => {
      state.currentAgent = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAgents.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchAgents.fulfilled, (state, action) => {
        state.loading = false
        state.list = action.payload.agents
        state.total = action.payload.total
      })
      .addCase(fetchAgents.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchAgentDetail.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchAgentDetail.fulfilled, (state, action) => {
        state.loading = false
        state.currentAgent = action.payload
      })
      .addCase(fetchAgentDetail.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchTrendingAgents.pending, (state) => {
        state.trendingLoading = true
      })
      .addCase(fetchTrendingAgents.fulfilled, (state, action) => {
        state.trendingLoading = false
        state.trending = action.payload
      })
      .addCase(fetchTrendingAgents.rejected, (state, action) => {
        state.trendingLoading = false
        state.error = action.error.message
      })
      .addCase(fetchPlatformStats.pending, (state) => {
        state.statsLoading = true
      })
      .addCase(fetchPlatformStats.fulfilled, (state, action) => {
        state.statsLoading = false
        state.stats = action.payload
      })
      .addCase(fetchPlatformStats.rejected, (state, action) => {
        state.statsLoading = false
        state.error = action.error.message
      })
  },
})

export const { clearCurrentAgent } = agentSlice.actions
export default agentSlice.reducer
