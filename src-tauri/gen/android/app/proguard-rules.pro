# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Tauri loads this plugin by class name (`register_android_plugin` in
# src-tauri/src/ble_android.rs) and fills its @InvokeArg classes by reflection,
# so R8 sees no reference to either and would strip them from a release build.
-keep class org.rynkbench.app.RynkBlePlugin { *; }
-keep class org.rynkbench.app.RynkBlePlugin$* { *; }
