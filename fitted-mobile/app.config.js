// Config that depends on the environment, layered over app.json.
//
// app.json stays the source of truth for everything static. This only adds the
// Google Sign-In plugin, and only when there is an iOS client id to give it.
//
// The plugin writes a URL scheme into Info.plist, and it has to be the reversed
// client id -- there is no sensible default. Hardcoding a placeholder would put
// a scheme in the binary that belongs to nobody, and the alternative of shipping
// the button anyway means it fails at the tap. So the plugin is added when the
// id exists and left out when it does not, and the button on the sign-in screen
// checks for the same variable. Missing configuration hides the option rather
// than breaking it.
//
// Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID to the iOS OAuth client id from Google
// Cloud, of the form 1234-abcd.apps.googleusercontent.com.

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Google publishes the URL scheme as the client id with its parts reversed. */
function reversedClientId(clientId) {
    return clientId.split('.').reverse().join('.');
}

module.exports = ({ config }) => {
    if (!IOS_CLIENT_ID) return config;

    return {
        ...config,
        plugins: [
            ...(config.plugins ?? []),
            [
                '@react-native-google-signin/google-signin',
                { iosUrlScheme: reversedClientId(IOS_CLIENT_ID) },
            ],
        ],
    };
};
