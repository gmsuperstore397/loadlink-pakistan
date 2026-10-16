package pk.loadlink.pakistan

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import pk.loadlink.pakistan.api.*

private enum class Screen { LOGIN, REGISTER, OTP, HOME, LOADS, MY_LOADS, VEHICLES, BOOKINGS, ADD_LOAD, ADD_VEHICLE, FARE }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { LoadLinkApp() }
    }
}

@Composable
private fun LoadLinkApp() {
    val scope = rememberCoroutineScope()
    var screen by remember { mutableStateOf(Screen.LOGIN) }
    var user by remember { mutableStateOf<ApiUser?>(null) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var otpEmail by remember { mutableStateOf("") }

    suspend fun refreshMe() {
        val r = ApiClient.auth.me()
        if (r.success && r.data?.user != null) {
            user = r.data.user
            screen = Screen.HOME
        } else { user = null; screen = Screen.LOGIN }
    }
    fun run(action: suspend () -> Unit) {
        scope.launch {
            loading = true; message = ""
            try { action() } catch (e: Exception) { message = e.message ?: "Network error" }
            finally { loading = false }
        }
    }

    MaterialTheme {
        Surface(Modifier.fillMaxSize()) {
            if (user == null) {
                when (screen) {
                    Screen.LOGIN -> LoginScreen(loading, message, { id, pass -> run {
                        val req = if (id.contains("@")) LoginRequest(email=id.trim().lowercase(),password=pass) else LoginRequest(mobile=id.trim(),password=pass)
                        val r=ApiClient.auth.login(req)
                        if(r.success) refreshMe() else message=r.message ?: "Login failed"
                    } }, {screen=Screen.REGISTER})
                    Screen.REGISTER -> RegisterScreen(loading,message,{screen=Screen.LOGIN}) {n,m,e,p,c -> run {
                        val r=ApiClient.auth.register(RegisterRequest(n,m,e,p,c))
                        if(r.success){otpEmail=e;screen=Screen.OTP}else message=r.message ?: "Registration failed"
                    }}
                    Screen.OTP -> OtpScreen(otpEmail,loading,message,{otp->run{
                        val r=ApiClient.auth.verifyOtp(VerifyOtpRequest(otpEmail,otp))
                        if(r.success)refreshMe() else message=r.message ?: "OTP verification failed"
                    }},{screen=Screen.REGISTER})
                    else -> LoginScreen(loading,message,{}, {screen=Screen.REGISTER})
                }
            } else {
                when(screen){
                    Screen.HOME -> HomeScreen(user!!,message,{screen=Screen.LOADS},{screen=Screen.MY_LOADS},{screen=Screen.VEHICLES},{screen=Screen.BOOKINGS},{screen=Screen.ADD_LOAD},{screen=Screen.ADD_VEHICLE},{screen=Screen.FARE}) {
                        run { ApiClient.auth.logout(); user=null; screen=Screen.LOGIN }
                    }
                    Screen.LOADS -> LoadsScreen(user!!,{screen=Screen.HOME})
                    Screen.MY_LOADS -> MyLoadsScreen({screen=Screen.HOME})
                    Screen.VEHICLES -> VehiclesScreen({screen=Screen.HOME})
                    Screen.BOOKINGS -> BookingsScreen(user!!,{screen=Screen.HOME})
                    Screen.ADD_LOAD -> AddLoadScreen(message,{screen=Screen.HOME}) { req -> run { val r=ApiClient.auth.createLoad(req); if(r.success)screen=Screen.MY_LOADS else message=r.message ?: "Could not post load" } }
                    Screen.ADD_VEHICLE -> AddVehicleScreen(message,{screen=Screen.HOME}) { req -> run { val r=ApiClient.auth.createVehicle(req); if(r.success)screen=Screen.VEHICLES else message=r.message ?: "Could not add vehicle" } }
                    Screen.FARE -> FareScreen({screen=Screen.HOME})
                    else -> screen=Screen.HOME
                }
            }
        }
    }
}

@Composable private fun LoginScreen(loading:Boolean,message:String,onLogin:(String,String)->Unit,onRegister:()->Unit){
    var id by remember{mutableStateOf("")};var pass by remember{mutableStateOf("")}
    AuthCard("Login"){Field("Email or Mobile",id){id=it};PasswordField("Password",pass){pass=it}
        Button(!loading&&id.isNotBlank()&&pass.isNotBlank(),{onLogin(id,pass)},Modifier.fillMaxWidth()){Text(if(loading)"Please wait..." else "Login")}
        TextButton(onRegister,Modifier.align(Alignment.CenterHorizontally)){Text("Create new account")};Message(message)}
}
@Composable private fun RegisterScreen(loading:Boolean,message:String,onBack:()->Unit,onRegister:(String,String,String,String,String)->Unit){
    var n by remember{mutableStateOf("")};var m by remember{mutableStateOf("")};var e by remember{mutableStateOf("")};var p by remember{mutableStateOf("")};var c by remember{mutableStateOf("")}
    AuthCard("Create Account"){Field("Full name",n){n=it};Field("Mobile",m){m=it};Field("Email",e){e=it};PasswordField("Password",p){p=it};Field("City",c){c=it}
        Button(!loading&&listOf(n,m,e,p,c).all{it.isNotBlank()},{onRegister(n,m,e,p,c)},Modifier.fillMaxWidth()){Text("Register")}
        TextButton(onBack){Text("Back to login")};Message(message)}
}
@Composable private fun OtpScreen(email:String,loading:Boolean,message:String,onVerify:(String)->Unit,onBack:()->Unit){
    var otp by remember{mutableStateOf("")}
    AuthCard("Verify Email"){Text("OTP sent to "+email,fontSize=14.sp);Field("OTP",otp){otp=it};Button(!loading&&otp.isNotBlank(),{onVerify(otp)},Modifier.fillMaxWidth()){Text("Verify OTP")};TextButton(onBack){Text("Back")};Message(message)}
}
@Composable private fun AuthCard(title:String,content:@Composable ColumnScope.()->Unit){
    Column(
        Modifier.fillMaxSize().background(Color(0xFFF4F7FA)).padding(22.dp),
        verticalArrangement=Arrangement.Center,
        horizontalAlignment=Alignment.CenterHorizontally
    ) {
        Surface(shape=RoundedCornerShape(24.dp),color=Color(0xFF087F8C),shadowElevation=8.dp) {
            Text("LL", modifier=Modifier.padding(horizontal=22.dp, vertical=14.dp), color=Color.White, fontSize=28.sp, fontWeight=FontWeight.ExtraBold)
        }
        Text("LoadLink Pakistan",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold,color=Color(0xFF183044),modifier=Modifier.padding(top=14.dp))
        Text("Pakistan ka smart transport marketplace",style=MaterialTheme.typography.bodyMedium,color=Color(0xFF657789),modifier=Modifier.padding(top=4.dp,bottom=22.dp))
        Surface(shape=RoundedCornerShape(24.dp),color=Color.White,shadowElevation=3.dp,modifier=Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp)) {
                Text(title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=Color(0xFF183044),modifier=Modifier.padding(bottom=12.dp))
                content()
            }
        }
    }
}
@Composable private fun Field(label:String,value:String,onChange:(String)->Unit)=OutlinedTextField(value,onChange,label={Text(label)},singleLine=true,modifier=Modifier.fillMaxWidth().padding(vertical=4.dp))
@Composable private fun PasswordField(label:String,value:String,onChange:(String)->Unit)=OutlinedTextField(value,onChange,label={Text(label)},singleLine=true,visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth().padding(vertical=4.dp))
@Composable private fun Message(message:String){if(message.isNotBlank())Text(message,color=MaterialTheme.colorScheme.error,modifier=Modifier.padding(6.dp))}

@Composable private fun HomeScreen(u:ApiUser,message:String,onLoads:()->Unit,onMyLoads:()->Unit,onVehicles:()->Unit,onBookings:()->Unit,onAddLoad:()->Unit,onAddVehicle:()->Unit,onFare:()->Unit,onLogout:()->Unit){
    val isCustomer = u.role == "CUSTOMER"
    val isDriver = u.role == "DRIVER" || u.role == "FLEET_OWNER"
    Column(Modifier.fillMaxSize().background(Color(0xFFF4F7FA))) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal=18.dp)
        ) {
            Row(Modifier.fillMaxWidth().padding(top=18.dp,bottom=18.dp), verticalAlignment=Alignment.CenterVertically) {
                Surface(shape=RoundedCornerShape(14.dp),color=Color(0xFF087F8C)) {
                    Text("LL",modifier=Modifier.padding(horizontal=12.dp,vertical=9.dp),color=Color.White,fontWeight=FontWeight.ExtraBold,fontSize=18.sp)
                }
                Column(Modifier.weight(1f).padding(start=10.dp)) {
                    Text("LoadLink Pakistan",fontWeight=FontWeight.Bold,fontSize=18.sp,color=Color(0xFF183044))
                    Text("TRANSPORT • CONNECT • DELIVER",fontSize=9.sp,letterSpacing=1.sp,color=Color(0xFF718496))
                }
                Surface(shape=RoundedCornerShape(50),color=Color.White,border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFE2EAF0))) {
                    Text("PK",modifier=Modifier.padding(horizontal=13.dp,vertical=10.dp),fontWeight=FontWeight.Bold,color=Color(0xFF087F8C),fontSize=12.sp)
                }
            }
            Text("Assalam-o-Alaikum,",fontSize=14.sp,color=Color(0xFF657789))
            Text(u.fullName?.takeIf{it.isNotBlank()} ?: "Welcome!",fontSize=27.sp,fontWeight=FontWeight.Bold,color=Color(0xFF183044),modifier=Modifier.padding(top=3.dp))
            Text(if(isCustomer) "Apne maal ke liye sahi transport dhoondein." else "Apni gaari aur available loads manage karein.",fontSize=14.sp,color=Color(0xFF657789),modifier=Modifier.padding(top=5.dp,bottom=18.dp))
            Surface(shape=RoundedCornerShape(16.dp),color=Color.White,border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFE2EAF0)),modifier=Modifier.fillMaxWidth()) {
                Row(verticalAlignment=Alignment.CenterVertically,modifier=Modifier.padding(horizontal=14.dp,vertical=15.dp)) {
                    Text("⌕",fontSize=24.sp,color=Color(0xFF087F8C),modifier=Modifier.padding(end=10.dp))
                    Text("Pickup, destination ya gaari search karein",fontSize=13.sp,color=Color(0xFF8191A0))
                }
            }
            Surface(shape=RoundedCornerShape(24.dp),color=Color(0xFF087F8C),modifier=Modifier.fillMaxWidth().padding(top=18.dp)) {
                Column(Modifier.padding(20.dp)) {
                    Text(if(isCustomer) "LOAD BHEJNA AB AASAAN" else "APNI GAARI KO KAM PAR LAGAYEIN",fontSize=10.sp,letterSpacing=1.1.sp,fontWeight=FontWeight.Bold,color=Color(0xFFBCEBE7))
                    Text(if(isCustomer) "Apna load. Apni marzi. Behtar transport." else "Naye loads dhoondein aur apni trips manage karein.",fontSize=21.sp,lineHeight=27.sp,fontWeight=FontWeight.Bold,color=Color.White,modifier=Modifier.padding(top=9.dp,bottom=15.dp))
                    Text("📍  Karachi     →     Lahore",fontSize=13.sp,color=Color.White.copy(alpha=0.92f))
                    Button(onClick=if(isCustomer) onAddLoad else onLoads,colors=ButtonDefaults.buttonColors(containerColor=Color.White,contentColor=Color(0xFF087F8C)),shape=RoundedCornerShape(13.dp),modifier=Modifier.fillMaxWidth().padding(top=17.dp)) {
                        Text(if(isCustomer) "Mujhe Load Bhejna Hai  →" else "Available Loads Dekhein  →",fontWeight=FontWeight.Bold)
                    }
                }
            }
            Text("Aap kya karna chahte hain?",fontSize=18.sp,fontWeight=FontWeight.Bold,color=Color(0xFF183044),modifier=Modifier.padding(top=23.dp,bottom=12.dp))
            Row(horizontalArrangement=Arrangement.spacedBy(12.dp),modifier=Modifier.fillMaxWidth()) {
                DashboardTile("📦","Available Loads","Loads browse karein",onLoads,Modifier.weight(1f))
                if(isCustomer) DashboardTile("🚚","Mere Loads","Apni requests dekhein",onMyLoads,Modifier.weight(1f))
                else DashboardTile("🚛","Meri Gaariyan","Vehicles manage karein",onVehicles,Modifier.weight(1f))
            }
            Row(horizontalArrangement=Arrangement.spacedBy(12.dp),modifier=Modifier.fillMaxWidth().padding(top=12.dp)) {
                if(isCustomer) DashboardTile("➕","Naya Load","Transport request banayein",onAddLoad,Modifier.weight(1f))
                else DashboardTile("➕","Gaari Add Karein","Vehicle details add karein",onAddVehicle,Modifier.weight(1f))
                DashboardTile("🧾","Bookings / Trips","Status aur details",onBookings,Modifier.weight(1f))
            }
            Surface(shape=RoundedCornerShape(18.dp),color=Color.White,border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFE2EAF0)),modifier=Modifier.fillMaxWidth().padding(top=16.dp)) {
                Row(verticalAlignment=Alignment.CenterVertically,modifier=Modifier.padding(16.dp)) {
                    Surface(shape=RoundedCornerShape(12.dp),color=Color(0xFFE5F6F3)) { Text("₹",modifier=Modifier.padding(horizontal=13.dp,vertical=10.dp),fontSize=22.sp,fontWeight=FontWeight.Bold,color=Color(0xFF087F8C)) }
                    Column(Modifier.weight(1f).padding(start=12.dp)) {
                        Text("Fare Estimate",fontWeight=FontWeight.Bold,color=Color(0xFF183044),fontSize=15.sp)
                        Text("Safar ka andazati kiraya check karein",fontSize=12.sp,color=Color(0xFF718496),modifier=Modifier.padding(top=3.dp))
                    }
                    TextButton(onClick=onFare) { Text("Open  →",fontWeight=FontWeight.Bold) }
                }
            }
            Surface(shape=RoundedCornerShape(16.dp),color=Color(0xFFE7F5F4),modifier=Modifier.fillMaxWidth().padding(top=16.dp,bottom=18.dp)) {
                Row(verticalAlignment=Alignment.CenterVertically,modifier=Modifier.padding(14.dp)) {
                    Text("✓",fontSize=20.sp,color=Color(0xFF087F8C),fontWeight=FontWeight.Bold,modifier=Modifier.padding(end=10.dp))
                    Column {
                        Text("LoadLink ke saath connected",fontWeight=FontWeight.SemiBold,color=Color(0xFF176B6A),fontSize=13.sp)
                        Text("Aapka account: "+(u.role?: "USER").replace("_"," "),fontSize=12.sp,color=Color(0xFF4F777A),modifier=Modifier.padding(top=2.dp))
                    }
                }
            }
            Message(message)
            TextButton(onLogout,Modifier.fillMaxWidth().padding(bottom=8.dp)) { Text("Logout",color=Color(0xFFB42318)) }
        }
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal=8.dp, vertical=7.dp),horizontalArrangement=Arrangement.SpaceAround,verticalAlignment=Alignment.CenterVertically) {
            BottomNavItem("⌂","Home",{})
            BottomNavItem("▤","Loads",onLoads)
            BottomNavItem(if(isCustomer) "▧" else "🚚",if(isCustomer) "My Loads" else "Vehicles",if(isCustomer) onMyLoads else onVehicles)
            BottomNavItem("◎","Bookings",onBookings)
        }
    }
}
@Composable private fun DashboardTile(icon:String,title:String,subtitle:String,onClick:()->Unit,modifier:Modifier=Modifier){
    Surface(onClick=onClick,shape=RoundedCornerShape(18.dp),color=Color.White,border=androidx.compose.foundation.BorderStroke(1.dp,Color(0xFFE2EAF0)),modifier=modifier) {
        Column(Modifier.padding(14.dp).heightIn(min=112.dp)) {
            Text(icon,fontSize=24.sp)
            Text(title,fontSize=14.sp,fontWeight=FontWeight.Bold,color=Color(0xFF183044),modifier=Modifier.padding(top=10.dp))
            Text(subtitle,fontSize=11.sp,color=Color(0xFF718496),lineHeight=15.sp,modifier=Modifier.padding(top=4.dp))
        }
    }
}
@Composable private fun BottomNavItem(icon:String,label:String,onClick:()->Unit){
    TextButton(onClick=onClick) {
        Column(horizontalAlignment=Alignment.CenterHorizontally) {
            Text(icon,fontSize=18.sp,color=Color(0xFF087F8C))
            Text(label,fontSize=10.sp,color=Color(0xFF526779),fontWeight=FontWeight.Medium)
        }
    }
}

@Composable private fun LoadsScreen(u:ApiUser,onBack:()->Unit){
    var loads by remember{mutableStateOf<List<LoadItem>>(emptyList())};var vehicles by remember{mutableStateOf<List<VehicleItem>>(emptyList())};var msg by remember{mutableStateOf("")};var selected by remember{mutableStateOf<LoadItem?>(null)}
    val scope=rememberCoroutineScope()
    LaunchedEffect(Unit){try{loads=ApiClient.auth.loads().data?.loads.orEmpty();if(u.role=="CUSTOMER")vehicles=ApiClient.auth.availableVehicles().data?.vehicles.orEmpty()}catch(e:Exception){msg=e.message?:"Network error"}}
    Page("Available Loads",onBack){Message(msg);LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp)){items(loads){l->Card(Modifier.fillMaxWidth()){Column(Modifier.padding(12.dp)){
        Text((l.pickupAddress?:"Pickup")+" → "+(l.destinationAddress?:"Destination"),style=MaterialTheme.typography.titleMedium);Text((l.weightKg?:0.0).toString()+" kg • "+(l.preferredVehicle?:"Any vehicle")+" • "+(l.status?:""))
        if(!l.description.isNullOrBlank())Text(l.description!!)
        if(u.role=="CUSTOMER"&&vehicles.isNotEmpty())Button({selected=l}){Text("Request vehicle")}
        if(u.role=="DRIVER"||u.role=="FLEET_OWNER")Button({scope.launch{try{msg=ApiClient.auth.contactTeam(l.id!!).message?:"Request sent"}catch(e:Exception){msg=e.message?:"Failed"}}}){Text("Contact LoadLink Team")}
    }}}}}
    selected?.let{l->AlertDialog(onDismissRequest={selected=null},title={Text("Select vehicle")},text={Column{vehicles.take(10).forEach{v->TextButton({scope.launch{try{msg=ApiClient.auth.createBooking(CreateBookingRequest(l.id!!,v.driverId!!,v.id!!)).message?:"Booking sent"}catch(e:Exception){msg=e.message?:"Booking failed"};selected=null}}){Text((v.vehicleType?:"Vehicle")+" • "+(v.vehicleNumber?:"")+" • "+(v.capacityKg?:0.0).toString()+" kg")}}}},confirmButton={TextButton({selected=null}){Text("Close")}})}
    }
}

@Composable private fun MyLoadsScreen(onBack:()->Unit){
    var items by remember{mutableStateOf<List<LoadItem>>(emptyList())};var msg by remember{mutableStateOf("")}
    LaunchedEffect(Unit){try{items=ApiClient.auth.myLoads().data?.loads.orEmpty()}catch(e:Exception){msg=e.message?:"Network error"}}
    Page("My Loads",onBack){Message(msg);LazyColumn{items(items){l->Card(Modifier.fillMaxWidth().padding(vertical=4.dp)){Column(Modifier.padding(12.dp)){Text((l.pickupAddress?:"")+" → "+(l.destinationAddress?:""),style=MaterialTheme.typography.titleMedium);Text((l.weightKg?:0.0).toString()+" kg • "+(l.status?:""))}}}}}
}
@Composable private fun VehiclesScreen(onBack:()->Unit){
    var items by remember{mutableStateOf<List<VehicleItem>>(emptyList())};var msg by remember{mutableStateOf("")}
    LaunchedEffect(Unit){try{items=ApiClient.auth.myVehicles().data?.vehicles.orEmpty()}catch(e:Exception){msg=e.message?:"Network error"}}
    Page("My Vehicles",onBack){Message(msg);LazyColumn{items(items){v->Card(Modifier.fillMaxWidth().padding(vertical=4.dp)){Column(Modifier.padding(12.dp)){Text((v.vehicleType?:"")+" • "+(v.vehicleNumber?:""),style=MaterialTheme.typography.titleMedium);Text((v.capacityKg?:0.0).toString()+" kg • "+(v.status?:""));Text(if(v.isVerified==true)"Verified" else "Verification: "+(v.verificationStatus?:"PENDING"))}}}}}
}
@Composable private fun BookingsScreen(u:ApiUser,onBack:()->Unit){
    var items by remember{mutableStateOf<List<BookingItem>>(emptyList())};var msg by remember{mutableStateOf("")};var selected by remember{mutableStateOf<BookingItem?>(null)};var fare by remember{mutableStateOf("")};val scope=rememberCoroutineScope()
    LaunchedEffect(Unit){try{items=ApiClient.auth.myBookings().data?.bookings.orEmpty()}catch(e:Exception){msg=e.message?:"Network error"}}
    Page("My Bookings / Trips",onBack){Message(msg);LazyColumn{items(items){b->Card(Modifier.fillMaxWidth().padding(vertical=4.dp)){Column(Modifier.padding(12.dp)){Text("Status: "+(b.status?:""),style=MaterialTheme.typography.titleMedium);Text("Load: "+(b.load?.pickupAddress?:"")+" → "+(b.load?.destinationAddress?:""))
        if(u.role=="DRIVER"&&b.status=="REQUESTED"){Button({selected=b}){Text("Accept")};TextButton({scope.launch{try{msg=ApiClient.auth.rejectBooking(b.id!!).message?:"Rejected";items=ApiClient.auth.myBookings().data?.bookings.orEmpty()}catch(e:Exception){msg=e.message?:"Reject failed"}}}){Text("Reject")}}}}}}}
    selected?.let{b->AlertDialog(onDismissRequest={selected=null},title={Text("Agreed fare")},text={Field("PKR",fare){fare=it}},confirmButton={TextButton({scope.launch{val n=fare.toDoubleOrNull();if(n==null){msg="Enter valid fare"}else{try{msg=ApiClient.auth.acceptBooking(b.id!!,AcceptBookingRequest(n)).message?:"Accepted";items=ApiClient.auth.myBookings().data?.bookings.orEmpty();selected=null}catch(e:Exception){msg=e.message?:"Accept failed"}}}}){Text("Confirm")}},dismissButton={TextButton({selected=null}){Text("Cancel")}})}
}
@Composable private fun AddLoadScreen(message:String,onBack:()->Unit,onCreate:(CreateLoadRequest)->Unit){
    var p by remember{mutableStateOf("")};var d by remember{mutableStateOf("")};var desc by remember{mutableStateOf("")};var w by remember{mutableStateOf("")};var vt by remember{mutableStateOf("")}
    Page("Post a Load",onBack){Field("Pickup address",p){p=it};Field("Destination address",d){d=it};Field("Description",desc){desc=it};Field("Weight (kg)",w){w=it};Field("Preferred vehicle",vt){vt=it};Button(p.isNotBlank()&&d.isNotBlank()&&w.toDoubleOrNull()!=null,{onCreate(CreateLoadRequest(p,d,desc,w.toDouble(),vt.ifBlank{null}))},Modifier.fillMaxWidth()){Text("Post Load")};Message(message)}
}
@Composable private fun AddVehicleScreen(message:String,onBack:()->Unit,onCreate:(CreateVehicleRequest)->Unit){
    var t by remember{mutableStateOf("")};var n by remember{mutableStateOf("")};var c by remember{mutableStateOf("")};var b by remember{mutableStateOf("")};var m by remember{mutableStateOf("")};var y by remember{mutableStateOf("")}
    Page("Add Vehicle",onBack){Field("Vehicle type",t){t=it};Field("Vehicle number",n){n=it};Field("Capacity (kg)",c){c=it};Field("Brand",b){b=it};Field("Model",m){m=it};Field("Year",y){y=it};Button(t.isNotBlank()&&n.isNotBlank()&&c.toDoubleOrNull()!=null,{onCreate(CreateVehicleRequest(t,n,c.toDouble(),b.ifBlank{null},m.ifBlank{null},y.toIntOrNull()))},Modifier.fillMaxWidth()){Text("Add Vehicle")};Message(message)}
}
@Composable private fun FareScreen(onBack:()->Unit){
    var a by remember{mutableStateOf("24.86")};var b by remember{mutableStateOf("67.01")};var c by remember{mutableStateOf("25.39")};var d by remember{mutableStateOf("68.36")};var type by remember{mutableStateOf("Loader Rickshaw")};var w by remember{mutableStateOf("")};var result by remember{mutableStateOf("")};val scope=rememberCoroutineScope()
    Page("Fare Estimate",onBack){Field("Pickup latitude",a){a=it};Field("Pickup longitude",b){b=it};Field("Destination latitude",c){c=it};Field("Destination longitude",d){d=it};Field("Vehicle type",type){type=it};Field("Weight kg",w){w=it}
        Button({scope.launch{try{val r=ApiClient.auth.estimateFare(FareRequest(a.toDouble(),b.toDouble(),c.toDouble(),d.toDouble(),type,w.toDoubleOrNull()));result=if(r.success)"Distance: "+r.data?.distanceKm+" km\nEstimated: PKR "+r.data?.estimatedFare+"\nRange: PKR "+r.data?.minFare+" - "+r.data?.maxFare else r.message?:"Fare failed"}catch(e:Exception){result=e.message?:"Network error"}}},Modifier.fillMaxWidth()){Text("Calculate Fare")}
        if(result.isNotBlank())Card(Modifier.fillMaxWidth().padding(top=12.dp)){Text(result,Modifier.padding(16.dp))}
    }
}
@Composable private fun Page(title:String,onBack:()->Unit,content:@Composable ColumnScope.()->Unit){Column(Modifier.fillMaxSize().background(Color(0xFFF4F7FA)).padding(horizontal=16.dp, vertical=12.dp)){TextButton(onBack){Text("← Back",fontWeight=FontWeight.SemiBold)};Text(title,style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold,color=Color(0xFF183044),modifier=Modifier.padding(start=4.dp,bottom=14.dp));Column(Modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(8.dp),content=content)}}
