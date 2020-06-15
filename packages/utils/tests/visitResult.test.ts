import { buildSchema, parse } from 'graphql';
import { visitResult } from '../src/visitResult';
import { Request } from '../src/Interfaces';

describe('visitData', () => {
  const schema = buildSchema(`
    interface TestInterface {
      field: String
    }
    type Test {
      field: String
    }
    type Query {
      test: TestInterface
    }
  `);

  const request: Request = {
    document: parse('{ test { field } }'),
    variables: {},
  };

  it('should visit without throwing', async () => {
    expect(() => visitResult({}, request, schema, undefined)).not.toThrow();
  });

  it('should allow visiting without a resultVisitorMap', async () => {
    const result = {
      data: {
        test: {
          __typename: 'Test',
          field: 'test',
        },
      },
    };

    const visitedResult = visitResult(result, request, schema, undefined);
    expect(visitedResult).toEqual(result);
  });

  it('should succesfully modify the result using an object type result visitor', async () => {
    const result = {
      data: {
        test: {
          __typename: 'Test',
          field: 'test',
        },
      },
    };

    const visitedResult = visitResult(result, request, schema, {
      Test: {
        field: () => 'success',
      },
    });

    const expectedResult = {
      data: {
        test: {
          __typename: 'Test',
          field: 'success',
        },
      },
    };

    expect(visitedResult).toEqual(expectedResult);
  });

  it('should successfully modify the result using a leaf type result visitor', async () => {
    const result = {
      data: {
        test: {
          __typename: 'Test',
          field: 'test',
        },
      },
    };

    const visitedResult = visitResult(result, request, schema, {
      String: () => 'success',
    });

    const expectedResult = {
      data: {
        test: {
          __typename: 'Test',
          field: 'success',
        },
      },
    };

    expect(visitedResult).toEqual(expectedResult);
  });

  it('should successfully modify the result using both leaf type and object type visitors', async () => {
    const result = {
      data: {
        test: {
          __typename: 'Test',
          field: 'test',
        },
      },
    };

    const visitedResult = visitResult(result, request, schema, {
      Test: {
        // leaf type visitors fire first.
        field: (value) => value === 'intermediate' ? 'success' : 'failure',
      },
      String: () => 'intermediate',
    });

    const expectedResult = {
      data: {
        test: {
          __typename: 'Test',
          field: 'success',
        },
      },
    };

    expect(visitedResult).toEqual(expectedResult);
  });

  it('should successfully modify the __typename field of an object', async () => {
    const result = {
      data: {
        test: {
          __typename: 'Test',
          field: 'test',
        },
      },
    };

    const visitedResult = visitResult(result, request, schema, {
      Test: {
        __typename: () => 'Success',
      },
    });

    const expectedResult = {
      data: {
        test: {
          __typename: 'Success',
          field: 'test',
        },
      },
    };

    expect(visitedResult).toEqual(expectedResult);
  });

  it('should successfully modify the object directly using the __leave field of an object type result visitor', async () => {
    const result = {
      data: {
        test: {
          __typename: 'Test',
          field: 'test',
        },
      },
    };

    const visitedResult = visitResult(result, request, schema, {
      Test: {
        __leave: (object) => ({
          ...object,
          __typename: 'Success',
        }),
      },
    });

    const expectedResult = {
      data: {
        test: {
          __typename: 'Success',
          field: 'test',
        },
      },
    };

    expect(visitedResult).toEqual(expectedResult);
  });
});
