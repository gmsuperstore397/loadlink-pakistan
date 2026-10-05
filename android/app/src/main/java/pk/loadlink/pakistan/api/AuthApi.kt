package pk.loadlink.pakistan.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PATCH
import retrofit2.http.Path

interface AuthApi {
    @POST("auth/login") suspend fun login(@Body request: LoginRequest): ApiResponse
    @POST("auth/register") suspend fun register(@Body request: RegisterRequest): ApiResponse
    @POST("auth/verify-otp") suspend fun verifyOtp(@Body request: VerifyOtpRequest): ApiResponse
    @GET("auth/me") suspend fun me(): ApiResponse
    @POST("auth/logout") suspend fun logout(): ApiResponse

    @GET("loads") suspend fun loads(): ApiResponse
    @GET("loads/mine") suspend fun myLoads(): ApiResponse
    @POST("loads") suspend fun createLoad(@Body request: CreateLoadRequest): ApiResponse
    @POST("loads/{id}/contact-team") suspend fun contactTeam(@Path("id") id: String): ApiResponse

    @GET("vehicles/mine") suspend fun myVehicles(): ApiResponse
    @GET("vehicles/available") suspend fun availableVehicles(): ApiResponse
    @POST("vehicles") suspend fun createVehicle(@Body request: CreateVehicleRequest): ApiResponse

    @GET("bookings/my") suspend fun myBookings(): ApiResponse
    @POST("bookings") suspend fun createBooking(@Body request: CreateBookingRequest): ApiResponse
    @PATCH("bookings/{id}/accept") suspend fun acceptBooking(@Path("id") id: String, @Body request: AcceptBookingRequest): ApiResponse
    @PATCH("bookings/{id}/reject") suspend fun rejectBooking(@Path("id") id: String): ApiResponse
    @PATCH("bookings/{id}/cancel") suspend fun cancelBooking(@Path("id") id: String): ApiResponse

    @POST("fare/estimate") suspend fun estimateFare(@Body request: FareRequest): ApiResponse
}
