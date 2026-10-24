dependencies {
	implementation(project(":core"))
	compileOnly("com.velocitypowered:velocity-api:${providers.gradleProperty("velocityApiVersion").get()}")
	annotationProcessor("com.velocitypowered:velocity-api:${providers.gradleProperty("velocityApiVersion").get()}")
	compileOnly("com.nickuc.login:api:${providers.gradleProperty("nloginApiVersion").get()}")
	testImplementation("com.velocitypowered:velocity-api:${providers.gradleProperty("velocityApiVersion").get()}")
}

tasks.jar {
	archiveBaseName.set("EdenSkinBridge-Velocity")
	from(project(":core").sourceSets.main.get().output) {
		include("fun/edenworld/skinbridge/core/AuthAssertion*.class")
		include("fun/edenworld/skinbridge/core/SecureTokens*.class")
	}
	manifest {
		attributes("Implementation-Version" to project.version)
	}
}

tasks.test {
	systemProperty("veloauth.jar", (findProperty("veloauthJar") as String?) ?: "")
}
