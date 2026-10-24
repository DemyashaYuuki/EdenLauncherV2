dependencies {
	compileOnly("com.google.code.gson:gson:${providers.gradleProperty("gsonVersion").get()}")
	testImplementation("com.google.code.gson:gson:${providers.gradleProperty("gsonVersion").get()}")
}
