declare module '@apiglimpse/middleware' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function apiSensor(options?: any): (
    req: any,
    res: any,
    next: (err?: any) => void,
  ) => void;
  export default apiSensor;
}

declare module '@apiglimpse/fastify' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function apiSensor(options?: any): (fastify: any) => Promise<void> | void;
  export default apiSensor;
}
