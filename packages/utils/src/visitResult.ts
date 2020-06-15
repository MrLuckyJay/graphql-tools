import {
  ExecutionResult,
  GraphQLSchema,
  getOperationRootType,
  getOperationAST,
  Kind,
  GraphQLObjectType,
  FieldNode,
  GraphQLOutputType,
  isListType,
  getNullableType,
  isAbstractType,
  isObjectType,
  OperationDefinitionNode,
  GraphQLError,
} from 'graphql';

import { Request, GraphQLExecutionContext } from './Interfaces';
import { collectFields, collectSubFields } from './collectFields';

export type ValueVisitor = (value: any) => any;

export type ObjectValueVisitor = {
  __enter?: ValueVisitor;
  __leave?: ValueVisitor;
} & Record<string, ValueVisitor>;

export type ResultVisitorMap = Record<string, ValueVisitor | ObjectValueVisitor>;

export type ErrorVisitor = (error: GraphQLError) => GraphQLError;

export type ErrorVisitorMap = Record<string, ErrorVisitor>;

export function visitResult(
  result: ExecutionResult,
  request: Request,
  schema: GraphQLSchema,
  resultVisitorMap?: ResultVisitorMap,
  errorVisitorMap?: ErrorVisitorMap
): any {
  const partialExecutionContext = {
    schema,
    fragments: request.document.definitions.reduce((acc, def) => {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        acc[def.name.value] = def;
      }
      return acc;
    }, {}),
    variableValues: request.variables,
  } as GraphQLExecutionContext;

  if (resultVisitorMap != null) {
    result.data = visitRoot(result.data, getOperationAST(request.document), partialExecutionContext, resultVisitorMap);
  }

  if (errorVisitorMap != null) {
    result.errors = visitErrors(result.errors);
  }

  return result;
}

function visitRoot(
  root: any,
  operation: OperationDefinitionNode,
  exeContext: GraphQLExecutionContext,
  resultVisitorMap: ResultVisitorMap
): any {
  const operationRootType = getOperationRootType(exeContext.schema, operation);
  const collectedFields = collectFields(
    exeContext,
    operationRootType,
    operation.selectionSet,
    Object.create(null),
    Object.create(null)
  );

  return visitObject(root, operationRootType, collectedFields, exeContext, resultVisitorMap);
}

function visitObject(
  object: Record<string, any>,
  returnType: GraphQLObjectType,
  fieldNodeMap: Record<string, Array<FieldNode>>,
  exeContext: GraphQLExecutionContext,
  resultVisitorMap: ResultVisitorMap
): Record<string, any> {
  const fieldMap = returnType.getFields();
  const typeVisitorMap = resultVisitorMap[returnType.name] as ObjectValueVisitor;

  const enterObject = typeVisitorMap?.__enter as ValueVisitor;
  const newObject = enterObject != null ? enterObject(object) : object;

  Object.keys(fieldNodeMap).forEach(responseKey => {
    const subFieldNodes = fieldNodeMap[responseKey];
    const fieldName = subFieldNodes[0].name.value;
    const type = fieldMap[fieldName].type;

    const newValue = visitFieldValue(object[responseKey], type, subFieldNodes, exeContext, resultVisitorMap);

    updateObject(newObject, responseKey, newValue, typeVisitorMap, fieldName);
  });

  const oldTypename = newObject.__typename;
  if (oldTypename != null) {
    updateObject(newObject, '__typename', oldTypename, typeVisitorMap, '__typename');
  }

  const leaveObject = typeVisitorMap?.__leave as ValueVisitor;

  return leaveObject != null ? leaveObject(newObject) : newObject;
}

function updateObject(
  object: Record<string, any>,
  responseKey: string,
  newValue: any,
  typeVisitorMap: ObjectValueVisitor,
  fieldName: string
): void {
  if (typeVisitorMap == null) {
    object[responseKey] = newValue;
    return;
  }

  const fieldVisitor = typeVisitorMap[fieldName];
  if (fieldVisitor == null) {
    object[responseKey] = newValue;
    return;
  }

  const visitedValue = fieldVisitor(newValue);
  if (visitedValue === undefined) {
    delete object[responseKey];
    return;
  }

  object[responseKey] = visitedValue;
}

function visitList(
  list: Array<any>,
  returnType: GraphQLOutputType,
  fieldNodes: Array<FieldNode>,
  exeContext: GraphQLExecutionContext,
  resultVisitorMap: ResultVisitorMap
): Array<any> {
  return list.map(listMember => visitFieldValue(listMember, returnType, fieldNodes, exeContext, resultVisitorMap));
}

function visitFieldValue(
  value: any,
  returnType: GraphQLOutputType,
  fieldNodes: Array<FieldNode>,
  exeContext: GraphQLExecutionContext,
  resultVisitorMap: ResultVisitorMap
): any {
  if (value == null) {
    return value;
  }

  const nullableType = getNullableType(returnType);
  if (isListType(nullableType)) {
    return visitList(value as Array<any>, nullableType.ofType, fieldNodes, exeContext, resultVisitorMap);
  } else if (isAbstractType(nullableType)) {
    const finalType = exeContext.schema.getType(value.__typename) as GraphQLObjectType;
    const collectedFields = collectSubFields(exeContext, finalType, fieldNodes);
    return visitObject(value, finalType, collectedFields, exeContext, resultVisitorMap);
  } else if (isObjectType(nullableType)) {
    const collectedFields = collectSubFields(exeContext, nullableType, fieldNodes);
    return visitObject(value, nullableType, collectedFields, exeContext, resultVisitorMap);
  }

  const typeVisitorMap = resultVisitorMap[nullableType.name] as ValueVisitor;
  if (typeVisitorMap == null) {
    return value;
  }

  const visitedValue = typeVisitorMap(value);
  return visitedValue === undefined ? value : visitedValue;
}

function visitErrors(errors: ReadonlyArray<GraphQLError>): ReadonlyArray<GraphQLError> {
  const newErrors = [];
  errors.forEach(error => {
    newErrors.push(error);
  });
  return errors;
}
