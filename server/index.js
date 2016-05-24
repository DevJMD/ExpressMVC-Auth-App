import Express       from 'express';
import Nunjucks      from 'nunjucks';
import Mongoose      from 'mongoose';
import BodyParser    from 'body-parser';
import cookieParser  from 'cookie-parser';
import Passport      from 'passport';
import PassportLocal from 'passport-local';
import session       from 'express-session';
import UUID          from 'node-uuid';
import glob          from 'glob';
import path          from 'path';
import morgan        from 'morgan';

import * as Config from './config';
import { CSRFProtection } from './middleware';
import User from './models/User';

export const App = Express();
export const Router = Express.Router();
export const Controller = {};

App.importControllers = (namespace, controllerPaths) => {
	for (const controllerPath of controllerPaths) {
		const filename = path.basename(controllerPath.slice(0, -3));
		namespace[filename] = require(controllerPath)[filename];
	}
}

export class Server {

	/**
	 * Static launch function to asynchronously initialise our app.
	 * @return callback.
	 */
	static launch(callback) {

		const LocalStrategy = PassportLocal.Strategy;
		const recurseControllers = glob.sync(path.resolve(__dirname, 'controllers/**/*.js'));

		// Configure controller routing.
		App.importControllers(Controller, recurseControllers);

		// Log out all requests to console if dev.
		if (Config.server.envrionment === 'development') {
			App.use(morgan('dev'));
		}

		// Config the template engine.
		Nunjucks.configure(Config.server.viewPath, {
			autoescape: true,
			express: App
		});

		// Set view engine and environment.
		App.set('view engine', Config.server.viewEngine);
		App.set('env', Config.server.envrionment);

		// Use the local strategy middleware.
		Passport.use(new LocalStrategy(User.authenticate()));

		// Serialize/Deserialize the session user.
		Passport.serializeUser(User.serializeUser());
		Passport.deserializeUser(User.deserializeUser());

		// Allow request paramaters from the body.
		App.use(BodyParser.urlencoded({ extended: false }));

		// Use /assets as the default static URL.
		App.use(Config.server.assetPath, Express.static(__dirname + Config.server.assets));

		// Enable session cookies, also allowing CSRF form protection.
		App.use(cookieParser());
		App.use(session({
			secret: UUID.v4(),
			name: 'session.id',
			resave: true,
			saveUninitialized: true
		}));

		// Enable csrf protection on all form routes by default.
		App.use(CSRFProtection);

		// Initialise passport session middleware.
		App.use(Passport.initialize());
		App.use(Passport.session());

		// Template-level check if the the current user is authenticated.
		App.use(function (req, res, next) {
			res.locals.assetPath = Config.server.assetPath;
			res.locals.isAuthenticated = req.isAuthenticated();
			next();
		});

		// Use Express router middleware.
		App.use(Router);

		// Finally, listen to the server and connect to our database.
		App.listen(8080, function() {
			Mongoose.connect(`mongodb://localhost/${Config.database.name}`, () => callback('Connected successfully at http://localhost:8080'));
		});
	}
}