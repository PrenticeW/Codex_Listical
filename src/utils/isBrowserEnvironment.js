const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export default isBrowserEnvironment;
