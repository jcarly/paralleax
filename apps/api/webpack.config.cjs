module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensionAlias: {
      ...options.resolve?.extensionAlias,
      '.js': ['.js', '.ts'],
    },
  },
});
