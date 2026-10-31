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
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 185});
    expect(getConnection()).toEqual({id: 'abc', name: 'MI Matrix Display', mtu: 185});
    clearConnection();
    expect(getConnection()).toBeNull();
    expect(seen).toEqual([{id: 'abc', name: 'MI Matrix Display', mtu: 185}, null]);
    unsubscribe();
  });

  test('unsubscribe stops notifications, and identical set is silent', () => {
    const seen: Array<unknown> = [];
    const unsubscribe = subscribeConnection(c => seen.push(c));
    setConnection({id: 'abc', name: null, mtu: null});
    setConnection({id: 'abc', name: null, mtu: null});
    expect(seen).toHaveLength(1);
    unsubscribe();
    clearConnection();
    expect(seen).toHaveLength(1);
  });

  test('MTU change on the same id notifies', () => {
    const seen: Array<unknown> = [];
    subscribeConnection(c => seen.push(c));
    setConnection({id: 'abc', name: null, mtu: null});
    setConnection({id: 'abc', name: null, mtu: 185});
    expect(seen).toHaveLength(2);
    clearConnection();
  });

  test('name change on the same id notifies', () => {
    const seen: Array<unknown> = [];
    subscribeConnection(c => seen.push(c));
    setConnection({id: 'abc', name: null, mtu: null});
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: null});
    expect(seen).toHaveLength(2);
    clearConnection();
  });
});
