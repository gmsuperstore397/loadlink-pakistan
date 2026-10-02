package pk.loadlink.pakistan.api

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

private class SessionCookieJar : CookieJar {
    private val cookies = mutableListOf<Cookie>()

    override fun saveFromResponse(url: HttpUrl, newCookies: List<Cookie>) {
        synchronized(cookies) {
            cookies.removeAll { old -> newCookies.any { it.name == old.name && it.domain == old.domain && it.path == old.path } }
            cookies.addAll(newCookies)
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        synchronized(cookies) { cookies.filter { it.matches(url) } }
}

object ApiClient {
    private val client = OkHttpClient.Builder()
        .cookieJar(SessionCookieJar())
        .build()

    val auth: AuthApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(AuthApi::class.java)
}
