import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { getSkills, getSkillById, getTrendingSkills } from '../../services/skillService'

export const fetchSkills = createAsyncThunk(
  'skill/fetchSkills',
  async ({ page = 1, pageSize = 20, category, search, sort }) => {
    const response = await getSkills({ page, pageSize, category, search, sort })
    return response.data
  }
)

export const fetchSkillDetail = createAsyncThunk(
  'skill/fetchSkillDetail',
  async (id) => {
    const response = await getSkillById(id)
    return response.data
  }
)

export const fetchTrendingSkills = createAsyncThunk(
  'skill/fetchTrendingSkills',
  async ({ limit = 10, days = 30 } = {}) => {
    const response = await getTrendingSkills({ limit, days })
    return response.data
  }
)

const skillSlice = createSlice({
  name: 'skill',
  initialState: {
    list: [],
    total: 0,
    currentSkill: null,
    loading: false,
    error: null,
    trending: [],
    trendingLoading: false,
  },
  reducers: {
    clearCurrentSkill: (state) => {
      state.currentSkill = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSkills.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchSkills.fulfilled, (state, action) => {
        state.loading = false
        state.list = action.payload.items
        state.total = action.payload.total
      })
      .addCase(fetchSkills.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchSkillDetail.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchSkillDetail.fulfilled, (state, action) => {
        state.loading = false
        state.currentSkill = action.payload
      })
      .addCase(fetchSkillDetail.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchTrendingSkills.pending, (state) => {
        state.trendingLoading = true
      })
      .addCase(fetchTrendingSkills.fulfilled, (state, action) => {
        state.trendingLoading = false
        state.trending = action.payload
      })
      .addCase(fetchTrendingSkills.rejected, (state, action) => {
        state.trendingLoading = false
        state.error = action.error.message
      })
  },
})

export const { clearCurrentSkill } = skillSlice.actions
export default skillSlice.reducer
