package pk.loadlink.pakistan.api

data class LoginRequest(
    val email: String? = null,
    val mobile: String? = null,
    val password: String
)

data class RegisterRequest(
    val fullName: String,
    val mobile: String,
    val email: String,
    val password: String,
    val city: String
)

data class VerifyOtpRequest(
    val email: String,
    val otp: String
)

data class ApiUser(
    val id: String? = null,
    val fullName: String? = null,
    val mobile: String? = null,
    val email: String? = null,
    val role: String? = null
)

data class ApiResponse(
    val success: Boolean = false,
    val message: String? = null,
    val data: ApiData? = null
)

data class ApiData(
    val user: ApiUser? = null,
    val verificationRequired: Boolean? = null,
    val otpDeliveryConfigured: Boolean? = null
)
