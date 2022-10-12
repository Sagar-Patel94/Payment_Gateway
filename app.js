const express = require('express');
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const transRouter = require('./routes/transactionRoutes');
const userRouter = require('./routes/userRoutes');
const roleRouter = require('./routes/roleRoutes');
const authRouter = require('./routes/authRoutes');
const customerRouter = require('./routes/customerRoutes');
const healthCheck = require('./routes/healthCheckRoutes');
const paysafeRouter = require('./routes/paysafeRoutes');
const serviceApiRouter = require('./routes/serviceApiKeyRoutes');
const plumRouter = require('./routes/plumRoutes');
const reportRouter = require('./routes/reportRoutes');
const app = express();

Sentry.init({
  dsn: 'https://3c51e525eac943949682dad2fd2056ca@o1201190.ingest.sentry.io/6352133',
  environment: process.env.NODE_ENV || 'development',
  integrations: [
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // enable Express.js middleware tracing
    new Tracing.Integrations.Express({ app }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});
//Middlewares
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(express.json({limit: "5mb"}));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

//swagger config
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerJSDocs = YAML.load('./api.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJSDocs));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
    return res.status(200).json({});
  }
  next();
});

// app.use(bodyParser.urlencoded({ extended: false }));
app.use(
  bodyParser.json({
    verify: function (req, res, buf) {
      req.rawBody = buf;
    },
  })
);

// // parse application/json
// app.use(bodyParser.json());
app.use('/api/v1/healthcheck', healthCheck);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/roles', roleRouter);
app.use(`/api/v1/vt`, transRouter);
app.use(`/api/v1/customer`, customerRouter);
app.use(`/api/v1/paysafe`, paysafeRouter);
app.use(`/api/v1/`, serviceApiRouter);
app.use(`/api/v1/plum`, plumRouter);
app.use(`/api/v1/report`, reportRouter);
// RequestHandler creates a separate execution context using domains, so that every
// transaction/span/breadcrumb is attached to its own Hub instance
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
  console.log(err)
});
module.exports = app;
