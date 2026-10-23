const path = require('node:path');
const nodeExternals = require('webpack-node-externals');

module.exports = (options) => ({
  ...options,

  // Bundle Nest packages together so adapter loading resolves from this API
  // bundle and the app and adapter share framework classes such as StreamableFile.
  externals: [nodeExternals({ allowlist: [/^@nestjs\//] })],

  entry: {
    ...(typeof options.entry === 'object' ? options.entry : { main: options.entry }),

    'qsp-import.worker': path.resolve(__dirname, 'src/stories/application/qsp-import.worker.ts'),
    'choicescript-import.worker': path.resolve(
      __dirname,
      'src/stories/application/choicescript-import.worker.ts',
    ),
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
    modules: [
      path.resolve(__dirname, 'node_modules'),
      ...(Array.isArray(options.resolve?.modules)
        ? options.resolve.modules
        : options.resolve?.modules
          ? [options.resolve.modules]
          : ['node_modules']),
    ],
    extensionAlias: {
      ...options.resolve?.extensionAlias,
      '.js': ['.js', '.ts'],
    },
  },
});
