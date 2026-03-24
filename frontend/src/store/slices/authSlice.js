import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import authService from '../../services/authService'

// 异步 thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authService.login(email, password)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || '登录失败')
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async ({ username, email, password, role }, { rejectWithValue }) => {
    try {
      const response = await authService.register(username, email, password, role)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || '注册失败')
    }
  }
)

export const sendEmailLoginCode = createAsyncThunk(
  'auth/sendEmailLoginCode',
  async ({ email }, { rejectWithValue }) => {
    try {
      const response = await authService.sendEmailLoginCode(email)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || '发送验证码失败')
    }
  }
)

export const loginWithEmailCode = createAsyncThunk(
  'auth/loginWithEmailCode',
  async ({ email, code, username }, { rejectWithValue }) => {
    try {
      const response = await authService.verifyEmailLoginCode(email, code, username)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || '邮箱登录失败')
    }
  }
)

export const getCurrentUser = createAsyncThunk(
  'auth/getCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getCurrentUser()
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || '获取用户信息失败')
    }
  }
)

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.updateProfile(data)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || '更新资料失败')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: authService.getUser(),
    token: authService.getToken(),
    isAuthenticated: authService.isAuthenticated(),
    loading: false,
    error: null
  },
  reducers: {
    logout: (state) => {
      authService.logout()
      state.user = null
      state.token = null
      state.isAuthenticated = false
      state.error = null
    },
    clearError: (state) => {
      state.error = null
    },
    hydrateToken: (state, action) => {
      const { token } = action.payload || {}
      if (!token) return
      authService.setToken(token)
      state.token = token
      state.isAuthenticated = true
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Register
      .addCase(register.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Send email code
      .addCase(sendEmailLoginCode.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(sendEmailLoginCode.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(sendEmailLoginCode.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Email code login
      .addCase(loginWithEmailCode.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginWithEmailCode.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
      })
      .addCase(loginWithEmailCode.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Get current user
      .addCase(getCurrentUser.pending, (state) => {
        state.loading = true
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
      })
      .addCase(getCurrentUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        // 如果获取用户信息失败，清除登录状态
        state.user = null
        state.token = null
        state.isAuthenticated = false
        authService.logout()
      })
      // Update profile
      .addCase(updateProfile.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const { logout, clearError, hydrateToken } = authSlice.actions
export default authSlice.reducer
