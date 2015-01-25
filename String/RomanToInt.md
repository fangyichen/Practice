Given a roman numeral, convert it to an integer.

Input is guaranteed to be within the range from 1 to 3999.

```java
public class Solution {
    public int romanToInt(String s) {
        int result = 0;
        int curr = 0;
        int prev = 1;
        for(int i = s.length()-1; i >= 0; i--){
            curr = romanToInt(s.charAt(i));
            if(curr >= prev ){
                result+= curr;
                prev = curr;
            }
            else result-=curr;
        }
        return result;
    }
    
    private int romanToInt(char c){
        switch(c){
            case 'I':
                return 1;
            case 'V':
                return 5;
            case 'X':
                return 10;
            case 'L':
                return 50;
            case 'C':
                return 100;
            case 'D':
                return 500;
            case 'M':
                return 1000;
        }
        return 0;
    }
}

```