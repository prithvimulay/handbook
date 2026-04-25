# JAVA Strings

* collection of characters surrounded by double quotes (""):
```
String greet = "Hello Java!";
```

### A String in Java is actually an object, which means it contains methods that can perform certain operations on strings.
```
// 1. length() method:
String txt = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
System.out.println("The length of the txt string is: " + txt.length());

// 2. Case change:
String txt = "Hello World";
System.out.println(txt.toUpperCase());   // Outputs "HELLO WORLD"
System.out.println(txt.toLowerCase());   // Outputs "hello world"

// 3. Find loc of char in String:
String txt = "Please locate where 'locate' occurs!";
System.out.println(txt.indexOf("locate")); // Outputs 7 

// 4. access the char at some index
String txt = "Hello"
System.out.println(txt.charAt(0)); // H
System.out.println(txt.charAt(4)); //  o
System.out.println(txt.charAt(txt.length() - 1)); // o


// 5. compare strings
String txt1 = "Greetings";
String txt2 = "Great things";
System.out.println(txt1.equals(txt2));    // false

// 6. Rem white spaces
String txt = "   Hello World   ";
System.out.println("Before: [" + txt + "]");
System.out.println("After:  [" + txt.trim() + "]");

// Before: [   Hello World   ]
// After: [Hello World]

// 7. Concate
String a = "Java ";
String b = "is ";
String c = "fun!";
String result = a.concat(b).concat(c);   // Java is fun!

// 8. + operator
// if num1 and num2 are both int => they add up
// if both are str like 
String x = "10";
String y = "20";
String z = x + y;  // z will be 1020 (a String)

// one is int and other is String
String x = "10";
int y = 20;
String z = x + y;  // z will be 1020 (a String)




