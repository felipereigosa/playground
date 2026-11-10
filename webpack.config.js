const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const express = require('express');
const bodyParser = require('body-parser');

module.exports = {
  mode: 'development',
  devServer: {
    hot: true,
    liveReload: true,
    port: process.env.PORT || 3000,
    // Plain http by default: reached through localhost (adb reverse, ssh
    // tunnel), which browsers already treat as secure for WebXR.
    // HTTPS=1 serves the self-signed cert, for opening it across the LAN.
    https: process.env.HTTPS ? {
      key: fs.readFileSync('key.pem'),
      cert: fs.readFileSync('cert.pem'),
    } : false,
    host: '0.0.0.0',

    onBeforeSetupMiddleware: (devServer) => {
      const app = express();
      app.use(bodyParser.json({ limit: '10mb' }));

      app.post('/store-actions', (req, res) => {
        fs.writeFile('actions.json', JSON.stringify(req.body), (err) => {});
      });

      app.get('/get-actions', (req, res) => {
        fs.readFile('actions.json', 'utf8', (err, data) => {
          res.json(JSON.parse(data));
        });
      });

      app.post('/store-view', (req, res) => {
        fs.writeFile('view.json', JSON.stringify(req.body), (err) => {});
      });

      app.get('/get-view', (req, res) => {
        fs.readFile('view.json', 'utf8', (err, data) => {
          res.json(JSON.parse(data));
        });
      });

      devServer.app.use(app);
    },
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'assets', to: '' },
      ],
    }),

    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  ],
};
