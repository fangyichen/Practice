Given a string, determine if it is a palindrome, considering only alphanumeric characters and ignoring cases.

For example,
"A man, a plan, a canal: Panama" is a palindrome.
"race a car" is not a palindrome.

Note:
Have you consider that the string might be empty? This is a good question to ask during an interview.

For the purpose of this problem, we define empty string as valid palindrome.

```java
public class Solution {
    public boolean isPalindrome(String s) {
        int front = 0;
        int tail = s.length()-1;
        
        while(front < tail){
            
            if(!isAlpha(s.charAt(front))){
                front++;
                continue;
            }
            if(!isAlpha(s.charAt(tail))){
                tail--;
                continue;
            }
            if(Character.toLowerCase(s.charAt(front))!=Character.toLowerCase(s.charAt(tail))){
                return false;
            }
            
            front++;
            tail--;
            
            
        }
        return true;
    }
    
    private boolean isAlpha(char c){
        return (c>='a'&&c<='z') ? true : ((c>='A'&&c<='Z') ? true : ((c>='0'&&c<='9') ? true : false));
    }
}

```