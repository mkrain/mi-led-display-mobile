import {
  clearConnection,
  getConnection,
  setConnection,
  subscribeConnection,
} from '../ble/connection';

describe('shared connection state', () => {
  beforeEach(() => {
    clearConnection();
  });

  test('starts disconnected', () => {
    expect(getConnection()).toBeNull();
  });

  test('set notifies subscribers, clear notifies null', () => {
    const seen: Array<unknown> = [];
    const unsubscribe = subscribeConnection(c => seen.push(c));
    setConnection({id: 'abc', name: 'MI Matrix Display'});
    expect(getConnection()).toEqual({id: 'abc', name: 'MI Matrix Display'});
    clearConnection();
    expect(getConnection()).toBeNull();
    expect(seen).toEqual([{id: 'abc', name: 'MI Matrix Display'}, null]);
    unsubscribe();
  });

  test('unsubscribe stops notifications, and identical set is silent', () => {
    const seen: Array<unknown> = [];
    const unsubscribe = subscribeConnection(c => seen.push(c));
    setConnection({id: 'abc', name: null});
    setConnection({id: 'abc', name: null});
    expect(seen).toHaveLength(1);
    unsubscribe();
    clearConnection();
    expect(seen).toHaveLength(1);
  });

  test('name change on the same id notifies', () => {
    const seen: Array<unknown> = [];
    subscribeConnection(c => seen.push(c));
    setConnection({id: 'abc', name: null});
    setConnection({id: 'abc', name: 'MI Matrix Display'});
    expect(seen).toHaveLength(2);
    clearConnection();
  });
});
