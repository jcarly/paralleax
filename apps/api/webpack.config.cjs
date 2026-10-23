const path = require('node:path');

module.exports = (options) => ({
  ...options,

  // Keep one Nest runtime copy so StreamableFile and other framework classes
  // retain their identity across the bundled application and Express adapter.
  externals: [
    ...(Array.isArray(options.externals)
      ? options.externals
      : options.externals
        ? [options.externals]
        : []),
    ({ request }, callback) => {
      if (request?.startsWith('@nestjs/')) {
        callback(null, `commonjs ${request}`);
        return;
      }
      callback();
    },
  ],

  entry: {
    ...(typeof options.entry === 'object' ? options.entry : { main: options.entry }),

    'qsp-import.worker': path.resolve(__dirname, 'src/stories/application/qsp-import.worker.ts'),
  },

  output: {
    ...options.output,
    filename: '[name].js',
  },

  node: {
    ...options.node,
    __dirname: false,
    __filename: false,
  },

  resolve: {
    ...options.resolve,
    extensionAlias: {
      ...options.resolve?.extensionAlias,
      '.js': ['.js', '.ts'],
    },
  },
});
