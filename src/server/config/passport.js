const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Only register the Google strategy if OAuth credentials are configured
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[Passport] Google OAuth credentials not set — Google sign-in disabled');
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value.toLowerCase();
          const googleId = profile.id;
          const name = profile.displayName;
          const avatar = profile.photos?.[0]?.value || '';

          // 1) Check if user exists with this googleId
          let user = await User.findOne({ googleId });
          if (user) {
            // Sync name and avatar from Google profile on each login
            let needsSave = false;
            if (name && user.name !== name) { user.name = name; needsSave = true; }
            if (avatar && user.avatar !== avatar) { user.avatar = avatar; needsSave = true; }
            if (needsSave) await user.save({ validateBeforeSave: false });
            return done(null, user);
          }

          // 2) Check if user exists with this email (link googleId)
          user = await User.findOne({ email });
          if (user) {
            user.googleId = googleId;
            user.avatar = avatar || user.avatar;
            // Update name from Google profile when first linking
            if (name) user.name = name;
            if (user.status === 'pending') {
              user.status = 'active';
            }
            await user.save({ validateBeforeSave: false });
            return done(null, user);
          }

          // 3) No user exists — reject (must be pre-authorized by admin)
          return done(null, false, { message: 'Not authorized — contact your administrator' });
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

module.exports = passport;
