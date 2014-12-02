var userDao = require('../dao');
var tokenManager = require('../managers/token');
var countrycodes = require('../countrycodes');
var async = require('async');

var config = JSON.parse(require('fs').readFileSync('./config.json','utf8'));

// PASSPORT
var passport = require('passport');
var forcedotcomStrategy = require('passport-forcedotcom').Strategy;
var salesforceStrategy = new forcedotcomStrategy({
        clientID : config.salesforce.clientId,
        clientSecret : config.salesforce.clientSecret,
        scope : config.salesforce.scope,
        callbackURL : config.salesforce.callbackURL,
        authorizationURL : config.salesforce.authUrl,
        tokenURL: config.salesforce.tokenUrl
    },
    function verify(accessToken, refreshToken, profile, done){
        var data = {
            accessToken:accessToken,
            refreshToken:refreshToken,
            profile:profile
        };
        done(null, data);
    }
);
passport.use(salesforceStrategy);

function salesforceCallback(req, res, next){
    var data = req.user;
    var profile = data.profile;
    userDao.getFromUsername(profile._raw.email, function(err, foundUser){
        if(err){
            if(err.message == userDao.ERROR_USER_NOT_FOUND){
                var sfData = {
                    accessToken:data.accessToken,
                    refreshToken:data.refreshToken
                };
                tokenManager.createAccessToken(profile.id, sfData, function(err, token){
                    countrycodes.countryFromPhone(profile._raw.mobile_phone, function(err, country){
                        var returnProfile = {
                            name: profile._raw.display_name,
                            email: profile._raw.email,
                            sf: token
                        };

                        if(err == null){
                            returnProfile.country = country['ISO3166-1-Alpha-2'];
                            returnProfile.phone = profile._raw.mobile_phone.replace('+'+country.Dial,'').trim();
                        }

                        res.send(203, returnProfile);
                        next(false);
                    });
                });
            } else {
                res.send(500, {err:'internal_error', des:'There was an internal error matching salesforce profile'});
                next(false);
            }
        } else {
            tokenManager.createBothTokens(foundUser.username, function(err, tokens){
                if(err) {
                    res.send(409,{err: err.message});
                } else {
                    tokens.expiresIn = config.accessToken.expiration * 60;
                    res.send(200,tokens);
                }
                next(false);
            });
        }
        next(false);
    });
}

function addRoutes(server){
    server.get('/auth/sf', passport.authenticate('forcedotcom'));
    server.get('/auth/sf/callback', passport.authenticate('forcedotcom', { failureRedirect: '/auth/error', session: false} ), salesforceCallback);
}

module.exports = addRoutes;