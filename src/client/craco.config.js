module.exports = {
  devServer: {
    setupMiddlewares: (middlewares, devServer) => {
      // Add middleware to handle hot-update requests locally instead of proxying
      devServer.app.get('/*.hot-update.json', (req, res) => {
        res.status(404).end();
      });
      
      devServer.app.get('/ws', (req, res) => {
        res.status(404).end();
      });
      
      return middlewares;
    },
    hot: true,
    liveReload: false,
    // Configure headers
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    // Configure client options
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
      reconnect: true,
      webSocketURL: {
        hostname: 'localhost',
        pathname: '/ws',
        port: 3001,
        protocol: 'ws',
      },
    },
    // Configure historyApiFallback to handle client-side routing
    historyApiFallback: {
      index: '/index.html',
      disableDotRule: true,
      rewrites: [
        { from: /^\/login$/, to: '/index.html' },
        { from: /^\/register$/, to: '/index.html' },
      ],
    },
    // Configure proxy only for API routes
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      if (webpackConfig.mode === 'development') {
        // Configure webpack to not generate problematic hot-update files
        webpackConfig.output = {
          ...webpackConfig.output,
          hotUpdateChunkFilename: '[id].[fullhash].hot-update.js',
          hotUpdateMainFilename: '[runtime].[fullhash].hot-update.json',
        };
      }
      
      return webpackConfig;
    },
  },
};