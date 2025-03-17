// .storybook/mocks.ts
export const createMocks = () => {
    // Mock function that can be used in stories
    const fn = () => {
      const mock = (...args: any[]) => {
        mock.calls.push(args);
        return mock.returnValue;
      };
      mock.calls = [] as any[][];
      mock.returnValue = undefined;
      mock.mockReturnValue = (val: any) => {
        mock.returnValue = val;
        return mock;
      };
      mock.mockImplementation = (implementation: any) => {
        mock.mockImplementation = implementation;
        return mock;
      };
      return mock;
    };
  
    return { fn };
  };
  
  // Export global mocks
  export const storyMocks = createMocks();