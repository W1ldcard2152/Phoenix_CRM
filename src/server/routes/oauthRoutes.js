const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Helper to sign JWT (same pattern as authController)
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// GET /api/auth/google — initiate Google OAuth
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

// GET /api/auth/google/callback — handle Google callback
router.get(
  '/google/callback',
  (req, res, next) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    passport.authenticate('google', {
      session: false,
      failureRedirect: `${clientUrl}/login?error=not_authorized`
    })(req, res, (err) => {
      if (err) {
        console.error('OAuth callback error:', err);
        return res.redirect(`${clientUrl}/login?error=auth_failed`);
      }

      if (!req.user) {
        return res.redirect(`${clientUrl}/login?error=not_authorized`);
      }

      // User is authenticated — issue JWT cookie and redirect
      const token = signToken(req.user._id);

      const cookieOptions = {
        expires: new Date(
          Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      };

      res.cookie('jwt', token, cookieOptions);
      res.redirect(`${clientUrl}/auth/callback`);
    });
  }
);

module.exports = router;
