# How JAVA works:
* here u must know all the JDK, JVM stuff - how the byte code is compiled and then run in a JVM so that u can execute the code
* always compile the code before we run it - 
```
1. javac fileName.java  -- to compile
2. java className
```
# Variable in JAVA
### primitive ones:
* int, byte, short, long, float, double, char, boolean - know all the ranges of these vars
### non-primitive ones:
* String, Arrays and Classes  
\  
* variable names ~ identifiers are case-senstive (myVar and myvar - both are different and can start with $ or _)
* for char use single quotes '' and for string use double quotes ""
* know diff between the float and double o/p, ranges, results 
* The precision of float is only 6-7 decimal digits, while double variables have a precision of about 16 digits.
* only these var have l and f written after the number
```
long var1 = 5348l;
float var2 = 5.5f;
```
* If you don't want others (or yourself) to overwrite existing values, use the final keyword (this will declare the variable as "final" or "constant", which means unchangeable and read-only):
```
final int numb = 100;
numb = 20           // will generate an error: cannot assign a value to a final variable
```
* A variable declared with final becomes a constant, which means unchangeable and read-only (whecre to use - minOfHour, birthDate)

* always remember what type are u converting like a byte can't be converted to a int, but the reverse can be done - make sure u check the range always
* solution to this issue is type casting - is when u explicatily tell the compiler to convert the to desired type
* types of casting:

    1. Widening Casting (automatic) - converting a smaller type to a larger type size
byte -> short -> char -> int -> long -> float -> double

    2. Narrowing Casting (manual) - converting a larger type to a smaller type size
double -> float -> long -> int -> char -> short -> byte

## Printing Stuff:
* Text must be wrapped inside double quotations marks "".
If you forget the double quotes, an error occurs:
```
System.out.println("This sentence will work!");
```
* (+) operator in JAVA:
    - for string it concatinates
    - for num it adds

## Logical Operators:

1. && ->	Logical AND |   Returns true if both statements are true	|   x < 5 &&  x < 10
2. || ->	Logical OR |	Returns true if one of the statements is true | 	x < 5 || x < 4
3. ! ->	Logical NOT |	Reverse the result, returns false if the result is true	| !(x < 5 && x < 10)

## Math.xyz()

1. max(), min(), sqrt(), abs(), pow(), round(), ceil(), floor(),
2. Math.random() - will generate a double b/w 0.0 to 1.0 so multiply it with 10 or 100 or 1000 to get a number in the desired range like 0-9, 0-100, 0-1000
