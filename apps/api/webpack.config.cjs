const path = require('node:path');

module.exports = (options) => ({
  ...options,

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
    extensionAlias: {
      ...options.resolve?.extensionAlias,
      '.js': ['.js', '.ts'],
    },
  },
});
