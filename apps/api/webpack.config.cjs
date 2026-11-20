const path = require('node:path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

// Nest 12 loads these optional integrations through `import()` specifiers that
// the Nest CLI webpack defaults do not ignore yet. Skip them only when they are
// not installed, as the CLI does for its own list.
const optionalNestImports = new Set([
  '@fastify/static',
  '@nestjs/microservices/microservices-module.js',
  '@nestjs/websockets/socket-module.js',
]);

const isMissingOptionalNestImport = (resource) => {
  if (!optionalNestImports.has(resource)) {
    return false;
  }
  try {
    require.resolve(resource, { paths: [process.cwd()] });
    return false;
  } catch {
    return true;
  }
};

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

  plugins: [
    ...(options.plugins ?? []),
    new webpack.IgnorePlugin({ checkResource: isMissingOptionalNestImport }),
  ],

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
