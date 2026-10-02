package pk.loadlink.pakistan.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): ApiResponse

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): ApiResponse

    @POST("auth/verify-otp")
    suspend fun verifyOtp(@Body request: VerifyOtpRequest): ApiResponse

    @GET("auth/me")
    suspend fun me(): ApiResponse

    @POST("auth/logout")
    suspend fun logout(): ApiResponse
}
