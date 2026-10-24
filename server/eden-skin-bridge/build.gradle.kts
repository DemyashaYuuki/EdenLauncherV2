plugins {
	java
}

allprojects {
	group = "fun.edenworld.skinbridge"
	version = providers.gradleProperty("bridgeVersion").get()
}

subprojects {
	apply(plugin = "java")

	repositories {
		mavenCentral()
		maven("https://repo.purpurmc.org/snapshots") {
			content { includeGroup("org.purpurmc.purpur") }
		}
		maven("https://repo.papermc.io/repository/maven-public/")
		maven("https://repo.codemc.org/repository/maven-releases/") {
			content { includeGroup("net.skinsrestorer") }
		}
		maven("https://repo.nickuc.com/maven-releases/") {
			content { includeGroup("com.nickuc.login") }
		}
	}

	java {
		toolchain {
			languageVersion.set(JavaLanguageVersion.of(25))
		}
	}

	tasks.withType<JavaCompile>().configureEach {
		options.release.set(21)
		options.encoding = "UTF-8"
		options.compilerArgs.addAll(listOf("-Xlint:all", "-Xlint:-processing", "-Xlint:-serial", "-Werror"))
	}

	tasks.withType<Test>().configureEach {
		useJUnitPlatform()
		testLogging {
			events("passed", "skipped", "failed")
			exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
		}
	}

	dependencies {
		"testImplementation"(platform("org.junit:junit-bom:${providers.gradleProperty("junitVersion").get()}"))
		"testImplementation"("org.junit.jupiter:junit-jupiter")
		"testRuntimeOnly"("org.junit.platform:junit-platform-launcher")
	}
}
