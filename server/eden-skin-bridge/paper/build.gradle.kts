val purpurApiVersion: String = (findProperty("purpurApi") as String?) ?: providers.gradleProperty("purpurApiVersion").get()

java {
	// SkinsRestorer 15.12.6 publishes Java 25 metadata; this plugin keeps Java 21 bytecode.
	disableAutoTargetJvm()
}

dependencies {
	implementation(project(":core"))
	compileOnly("org.purpurmc.purpur:purpur-api:$purpurApiVersion")
	compileOnly("net.skinsrestorer:skinsrestorer-api:${providers.gradleProperty("skinsRestorerApiVersion").get()}")
	compileOnly("com.nickuc.login:api:${providers.gradleProperty("nloginApiVersion").get()}")
	testImplementation("org.purpurmc.purpur:purpur-api:$purpurApiVersion")
	testImplementation("net.skinsrestorer:skinsrestorer-api:${providers.gradleProperty("skinsRestorerApiVersion").get()}")
	testImplementation("com.google.code.gson:gson:${providers.gradleProperty("gsonVersion").get()}")
}

tasks.processResources {
	val props = mapOf("version" to project.version)
	inputs.properties(props)
	filesMatching("plugin.yml") {
		expand(props)
	}
}

tasks.jar {
	archiveBaseName.set("EdenSkinBridge-Paper")
	from(project(":core").sourceSets.main.get().output)
	manifest {
		attributes("Implementation-Version" to project.version)
	}
}
