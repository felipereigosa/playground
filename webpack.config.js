const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const express = require('express');
const bodyParser = require('body-parser');
const { execFile, execFileSync } = require('child_process');

// The dev server runs on the laptop, whose adb reaches the Quest (wireless).
const adb = process.env.ADB || `${process.env.HOME}/Android/platform-tools/adb`;
// Felipe's own build of Moonlight XR (~/Files/projects/virtual-desktop)
const moonlight = 'com.gilleece.moonlightxr.debug/com.limelight.PcView';

function questSerial () {
  const devices = execFileSync(adb, ['devices', '-l']).toString();
  const line = devices.split('\n').find(l => l.includes('model:Quest'));
  return line?.split(/\s+/)[0];
}

module.exports = {
  mode: 'development',
  devServer: {
    hot: true,
    liveReload: true,
    port: process.env.PORT || 8300, // the laptop's 3000 is taken
    // Self-signed cert for the laptop's LAN address, so the Quest can open
    // it directly. HTTP=1 serves plain http instead.
    https: !process.env.HTTP ? {
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

      // Back to Moonlight on the Quest, called when leaving VR. Launched
      // like the home screen does, so the running stream comes to the front.
      app.post('/desktop', (req, res) => {
        const serial = questSerial();
        if (!serial) return res.sendStatus(404);
        execFile(adb, ['-s', serial, 'shell', 'am', 'start',
                       '-a', 'android.intent.action.MAIN',
                       '-c', 'android.intent.category.LAUNCHER',
                       '-n', moonlight],
                 err => res.sendStatus(err ? 500 : 200));
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
