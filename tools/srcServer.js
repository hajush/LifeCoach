import express from 'express';
import webpack from 'webpack';
import path from 'path';
import config from '../webpack.config.dev';
import open from 'open';
// Try to only do import for dependencies, not require - Harold
const bodyParser = require('body-parser');
const uriUtil = require('mongodb-uri');
import User from '../models/user';
import Wheel from '../models/wheel';
import Goal from '../models/goal';
import wheelRoutes from '../routes/wheel';
import goalRoutes from '../routes/goal';
const jwt = require('jsonwebtoken');
const authConfig = require('./authConfig');
const morgan = require('morgan');
const apiRoutes = express.Router();
const hash = require('password-hash');
const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost/lifecoach';
const mongooseUri = uriUtil.formatMongoose(mongodbUri);
const options = {
  server: { socketOptions: { keepAlive: 1, connectTimeoutMS: 30000 } },
  replset: { socketOptions: { keepAlive: 1, connectTimeoutMS: 30000 } }
};
mongoose.connect(mongooseUri, options);

const port = process.env.PORT || 3000;
const app = express();
const PROD = process.env.NODE_ENV === 'production';

// get this secret from a process.env environment variable like the PORT and MONGODB_URI - Harold
app.set('superSecret', authConfig.secret);
/* eslint-disable no-console */
const compiler = webpack(config);


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.use(express.static('public'));

if (PROD) {
  app.use('/', express.static('dist'));
} else {
  // When not in production, enable hot reloading
  app.use(require('webpack-dev-middleware')(compiler, {
    noInfo: true,
    publicPath: config.output.publicPath
  }));
  app.use(require('webpack-hot-middleware')(compiler));
  app.use(morgan('dev'));
}

app.post('/newuser', function(req, res) {
  let user = new User({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    password: hash.generate(req.body.password)
  });
  user.save(function(err) {
    if (err) throw err;
    console.log('User saved successfully');
    res.json({ success: true, user: user});
  });
});
apiRoutes.post('/authenticate', function(req, res) {
  User.findOne({
    email: req.body.email
  }, function(err, user) {
    if (err) throw err;
    if (!user) {
      res.json({ success: false, message: 'Authentication failed. User not found.'});
    } else if(user) {
      console.log(req.body.email, req.body.password, user);
      if (!hash.verify(req.body.password, user.password)) {
        res.json({ success: false, message: 'Authentication failed. Incorrect password.'});
      } else {
        let token = jwt.sign(user, app.get('superSecret'), {
          expiresIn: 1440
        });
        res.json({
          success: true,
          message: 'Enjoy your token!',
          token: token,
          userId: user._id,
          firstName: user.firstName
        });
      }
    }
  });
});
apiRoutes.use(function(req,res,next) {
  let token = req.body.token || req.query.token || req.headers['x-access-token'];
  if(token) {
    jwt.verify(token, app.get('superSecret'), function(err, decoded) {
      if(err) {
        return res.json({success: false, message: 'Failed to authenticate token.'});
      } else {
        req.decoded = decoded;
        next();
      }
    });
  } else {
    return res.status(403).send({
      success: false,
      message: 'No token provided.'
    });
  }
});
apiRoutes.get('/', function(req,res) {
  res.json({ message: 'Welcome to the coolest API on earth!' });
});
apiRoutes.get('/users', function(req, res) {
  User.find({}, function(err, users) {
    res.json(users);
  });
});
app.get('/', function(req, res) {
  res.sendFile(path.join( __dirname, '../public/index.html'));
});

app.use('/wheel', wheelRoutes);
app.use('/goal', goalRoutes);

app.use('/api', apiRoutes);

app.listen(port, function(err) {
  if (err) {
    console.log(err);
  } else if (!PROD) {
    console.log(('Starting app in dev mode, listening on port ' + port).green);
    open(`http://localhost:${port}`);
  } else {
    console.log('Starting app in production mode, listening on port ' + port);
  }
});
