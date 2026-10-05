package pk.loadlink.pakistan.api

data class LoginRequest(val email: String? = null, val mobile: String? = null, val password: String)
data class RegisterRequest(val fullName: String, val mobile: String, val email: String, val password: String, val city: String)
data class VerifyOtpRequest(val email: String, val otp: String)

data class ApiUser(
    val id: String? = null, val fullName: String? = null, val mobile: String? = null,
    val email: String? = null, val role: String? = null, val city: String? = null
)

data class ApiResponse(
    val success: Boolean = false, val message: String? = null, val data: ApiData? = null
)

data class ApiData(
    val user: ApiUser? = null, val verificationRequired: Boolean? = null,
    val otpDeliveryConfigured: Boolean? = null, val loads: List<LoadItem>? = null,
    val load: LoadItem? = null, val vehicles: List<VehicleItem>? = null,
    val vehicle: VehicleItem? = null, val bookings: List<BookingItem>? = null,
    val booking: BookingItem? = null, val trip: TripItem? = null,
    val request: ContactRequest? = null, val alreadyExists: Boolean? = null,
    val distanceKm: Double? = null, val estimatedFare: Double? = null,
    val minFare: Double? = null, val maxFare: Double? = null, val disclaimer: String? = null
)

data class LoadItem(
    val id: String? = null, val pickupAddress: String? = null, val destinationAddress: String? = null,
    val description: String? = null, val weightKg: Double? = null, val preferredVehicle: String? = null,
    val status: String? = null, val createdAt: String? = null
)

data class VehicleItem(
    val id: String? = null, val driverId: String? = null, val vehicleType: String? = null,
    val vehicleNumber: String? = null, val capacityKg: Double? = null, val brand: String? = null,
    val model: String? = null, val year: Int? = null, val status: String? = null,
    val isVerified: Boolean? = null, val verificationStatus: String? = null
)

data class BookingItem(
    val id: String? = null, val loadId: String? = null, val driverId: String? = null,
    val vehicleId: String? = null, val status: String? = null, val agreedFare: Double? = null,
    val platformFee: Double? = null, val driverPayout: Double? = null,
    val load: LoadItem? = null, val vehicle: VehicleItem? = null
)

data class TripItem(val id: String? = null, val status: String? = null, val pickup: String? = null, val destination: String? = null)
data class ContactRequest(val id: String? = null, val status: String? = null)
data class CreateLoadRequest(
    val pickupAddress: String, val destinationAddress: String, val description: String,
    val weightKg: Double, val preferredVehicle: String? = null
)
data class CreateVehicleRequest(
    val vehicleType: String, val vehicleNumber: String, val capacityKg: Double,
    val brand: String? = null, val model: String? = null, val year: Int? = null
)
data class CreateBookingRequest(val loadId: String, val driverId: String, val vehicleId: String)
data class AcceptBookingRequest(val agreedFare: Double)
data class FareRequest(
    val pickupLat: Double, val pickupLng: Double, val destinationLat: Double,
    val destinationLng: Double, val vehicleType: String? = null, val weightKg: Double? = null
)
