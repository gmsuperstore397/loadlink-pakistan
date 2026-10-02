package pk.loadlink.pakistan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import pk.loadlink.pakistan.api.ApiClient
import pk.loadlink.pakistan.api.LoginRequest
import pk.loadlink.pakistan.api.RegisterRequest
import pk.loadlink.pakistan.api.VerifyOtpRequest

sealed interface AuthState {
    data object Idle : AuthState
    data object Loading : AuthState
    data class Success(val message: String, val userName: String?) : AuthState
    data class OtpRequired(val email: String, val message: String) : AuthState
    data class Error(val message: String) : AuthState
}

class AuthViewModel : ViewModel() {
    var state: AuthState = AuthState.Idle
        private set

    fun login(identifier: String, password: String) {
        state = AuthState.Loading
        viewModelScope.launch {
            try {
                val request = if (identifier.contains("@")) {
                    LoginRequest(email = identifier.trim().lowercase(), password = password)
                } else {
                    LoginRequest(mobile = identifier.trim(), password = password)
                }
                val response = ApiClient.auth.login(request)
                state = if (response.success) {
                    AuthState.Success(response.message ?: "Login successful", response.data?.user?.fullName)
                } else AuthState.Error(response.message ?: "Login failed")
            } catch (e: Exception) {
                state = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun register(fullName: String, mobile: String, email: String, password: String, city: String) {
        state = AuthState.Loading
        viewModelScope.launch {
            try {
                val response = ApiClient.auth.register(RegisterRequest(fullName, mobile, email, password, city))
                state = if (response.success) {
                    AuthState.OtpRequired(email, response.message ?: "OTP sent")
                } else AuthState.Error(response.message ?: "Registration failed")
            } catch (e: Exception) {
                state = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun verifyOtp(email: String, otp: String) {
        state = AuthState.Loading
        viewModelScope.launch {
            try {
                val response = ApiClient.auth.verifyOtp(VerifyOtpRequest(email, otp))
                state = if (response.success) {
                    AuthState.Success(response.message ?: "Email verified", response.data?.user?.fullName)
                } else AuthState.Error(response.message ?: "OTP verification failed")
            } catch (e: Exception) {
                state = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun clear() { state = AuthState.Idle }
}
