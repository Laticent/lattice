import { describe, expect, it } from 'vitest';
import { integerToWords, numberToWords, spokenWordCount, toSpoken } from './normalize';

describe('numberToWords', () => {
  it('reads integers with scale groups', () => {
    expect(integerToWords(0)).toBe('zero');
    expect(integerToWords(19)).toBe('nineteen');
    expect(integerToWords(42)).toBe('forty-two');
    expect(integerToWords(305)).toBe('three hundred five');
    expect(integerToWords(1024)).toBe('one thousand twenty-four');
    expect(integerToWords(4_200_000)).toBe('four million two hundred thousand');
  });

  it('reads decimals digit-by-digit after the point', () => {
    expect(numberToWords(4.2)).toBe('four point two');
    expect(numberToWords(18.5)).toBe('eighteen point five');
    expect(numberToWords(-3)).toBe('negative three');
  });
});

describe('toSpoken', () => {
  it('expands money with a magnitude suffix and keeps trailing punctuation', () => {
    expect(toSpoken('$4.2M')).toBe('four point two million dollars');
    expect(toSpoken('$4.2M.')).toBe('four point two million dollars.');
    expect(toSpoken('£3,200')).toBe('three thousand two hundred pounds');
  });

  it('expands percentages and bare magnitude numbers', () => {
    expect(toSpoken('18.5%')).toBe('eighteen point five percent');
    expect(toSpoken('4.2M')).toBe('four point two million');
    expect(toSpoken('1,024')).toBe('one thousand twenty-four');
  });

  it('maps known abbreviations and passes everything else through', () => {
    expect(toSpoken('Q3')).toBe('Q three');
    expect(toSpoken('revenue')).toBe('revenue');
    expect(toSpoken('grew,')).toBe('grew,');
  });

  it('display and spoken diverge in word count (the normalization gap)', () => {
    // One displayed token → five spoken words: exactly why timing rides `spoken`.
    expect(spokenWordCount(toSpoken('$4.2M'))).toBe(5);
    expect(spokenWordCount(toSpoken('up'))).toBe(1);
  });
});
