const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/apple-home-strategy.ts',
  output: {
    clean: true,
    filename: 'apple-home-dashboard.js', // renamed to match repository name
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: [/node_modules/, /src\/backup/],
      },
    ],
  },
  plugins: [
    new (require('webpack')).optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
};
